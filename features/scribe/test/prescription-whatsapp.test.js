import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { PrescriptionPdfService } from "../services/prescription-pdf.service.js";
import { sendPrescriptionDocument } from "../services/prescription-whatsapp.js";
import {
  PRESCRIPTION_WHATSAPP_TEMPLATE_NAME,
  PRESCRIPTION_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
  PRESCRIPTION_WHATSAPP_TEMPLATE_BODY,
} from "../constants.js";
import { formatSlotLabel } from "../../booking/lib/slot-engine.js";

const PDF_URL = "https://storage.example/clinic-1/appt-1.pdf?sig=1";
const SLOT_START = "2026-07-06T03:30:00.000Z";
const EXPECTED_SLOT_LABEL = formatSlotLabel(new Date(SLOT_START));

test("PRESCRIPTION_WHATSAPP_TEMPLATE_BODY matches proposed appt_prescription body (invoice shape)", () => {
  assert.equal(PRESCRIPTION_WHATSAPP_TEMPLATE_NAME, "appt_prescription");
  assert.equal(PRESCRIPTION_WHATSAPP_TEMPLATE_LANGUAGE_CODE, "en");
  assert.equal(
    PRESCRIPTION_WHATSAPP_TEMPLATE_BODY,
    "Your prescription for the appointment on {{1}} is attached.",
  );
  assert.match(PRESCRIPTION_WHATSAPP_TEMPLATE_BODY, /\{\{1\}\}/);
  assert.equal((PRESCRIPTION_WHATSAPP_TEMPLATE_BODY.match(/\{\{\d+\}\}/g) || []).length, 1);
});

test("sendPrescriptionDocument: WHATSAPP_TEMPLATES_LIVE=false stubs and does not call Meta", async () => {
  const templateCalls = [];
  const documentCalls = [];
  const wa = {
    async sendTemplate(...args) { templateCalls.push(args); },
    async sendDocument(...args) { documentCalls.push(args); },
  };

  const result = await sendPrescriptionDocument("PNID", "919876543210", PDF_URL, {
    whatsappClient: wa,
    bodyParams: [EXPECTED_SLOT_LABEL],
    filename: "RX-000001.pdf",
    templatesLive: false,
  });

  assert.equal(result.stubbed, true);
  assert.equal(result.templateName, PRESCRIPTION_WHATSAPP_TEMPLATE_NAME);
  assert.equal(templateCalls.length, 0);
  assert.equal(documentCalls.length, 0);
});

test("sendPrescriptionDocument: live send calls sendTemplate then sendDocument with phone, URL, and {{1}} slot label", async () => {
  const templateCalls = [];
  const documentCalls = [];
  const wa = {
    async sendTemplate(phoneNumberId, toPhone, opts) {
      templateCalls.push({ phoneNumberId, toPhone, opts });
      return { messages: [{ id: "wamid.tpl" }] };
    },
    async sendDocument(phoneNumberId, toPhone, opts) {
      documentCalls.push({ phoneNumberId, toPhone, opts });
      return { messages: [{ id: "wamid.doc" }] };
    },
  };

  const result = await sendPrescriptionDocument("PNID_1", "919876543210", PDF_URL, {
    whatsappClient: wa,
    bodyParams: [EXPECTED_SLOT_LABEL],
    filename: "RX-000007.pdf",
    templatesLive: true,
  });

  assert.equal(result.templateSent, true);
  assert.equal(result.documentSent, true);
  assert.equal(templateCalls[0].opts.templateName, PRESCRIPTION_WHATSAPP_TEMPLATE_NAME);
  assert.equal(templateCalls[0].opts.languageCode, PRESCRIPTION_WHATSAPP_TEMPLATE_LANGUAGE_CODE);
  assert.deepEqual(templateCalls[0].opts.bodyParams, [EXPECTED_SLOT_LABEL]);
  assert.equal(documentCalls[0].opts.link, PDF_URL);
  assert.equal(documentCalls[0].opts.filename, "RX-000007.pdf");
});

function makePdfServiceHarness({
  templatesLive = true,
  lastMessageAt = new Date().toISOString(),
  sendThrows = null,
  existingNumber = null,
  existingPath = null,
  contactPhone = "919876543210",
  phoneNumberId = "PNID_1",
} = {}) {
  const sendCalls = [];
  const alertCalls = [];
  const updates = [];
  const uploads = [];

  const draft = {
    id: "draft-1",
    session_id: "sess-1",
    appointment_id: "appt-1",
    draft: {
      diagnosis: ["URI"],
      medications: [
        {
          name: "Azithromycin",
          dosage: "500mg",
          frequency: "OD",
          duration: "3 days",
          instructions: "",
          confidence: 0.9,
        },
      ],
      advice: [],
      investigations: [],
      warnings: [],
      followUpInstructions: "",
    },
    prescription_number: existingNumber,
    pdf_storage_path: existingPath,
    approved_at: "2026-07-22T05:00:00.000Z",
  };

  const prescriptionRepo = {
    async allocateNextNumber() {
      return { prescriptionSeq: 7, prescriptionNumber: "RX-000007" };
    },
    async getGenerationContext() {
      return {
        doctor: {
          full_name: "Dr. Rao",
          specialization: "GP",
          clinic_name: "Nadi Care",
          clinic_address: "12 MG Road",
          license_number: "MCI-1",
        },
        patient: { name: "Asha", age: 34, date_of_birth: "1992-04-15" },
        appointment: { id: "appt-1", slot_start: SLOT_START },
      };
    },
    async getDoctorProfile() { return null; },
    async getClinicPhone() { return "+91 80 1234 5678"; },
    async updateDraftFields(draftId, fields) {
      updates.push({ draftId, fields });
      Object.assign(draft, fields);
      return draft;
    },
  };

  const storage = {
    async createSignedUrl(path) {
      return `https://storage.example/${path}?sig=reuse`;
    },
    async uploadPrescriptionPdf({ clinicId, appointmentId, pdfBytes }) {
      uploads.push({ clinicId, appointmentId, pdfBytes });
      const loaded = await PDFDocument.load(pdfBytes);
      assert.equal(loaded.getPageCount(), 1);
      return {
        storagePath: `${clinicId}/${appointmentId}.pdf`,
        pdfUrl: PDF_URL,
      };
    },
  };

  async function sendFn(phoneNumberIdArg, patientPhone, pdfUrl, opts) {
    sendCalls.push({ phoneNumberId: phoneNumberIdArg, patientPhone, pdfUrl, opts });
    if (sendThrows) throw sendThrows;
    return {
      templateName: PRESCRIPTION_WHATSAPP_TEMPLATE_NAME,
      templateSent: true,
      documentSent: true,
    };
  }

  const clinicRepo = {
    async findById() {
      return {
        id: "clinic-1",
        name: "Nadi Care",
        whatsapp_phone_number_id: phoneNumberId,
      };
    },
  };

  const appointmentRepo = {
    async findByIdForClinic() {
      return {
        id: "appt-1",
        contact_phone: contactPhone,
        slot_start: SLOT_START,
        patient_id: "patient-1",
      };
    },
  };

  const conversationStateRepo = {
    async find() {
      return { last_message_at: lastMessageAt };
    },
  };

  // Patch alertOps via module is hard; we assert send failure paths via return
  // values and that deliver never throws. alertOps is best-effort inside the service.
  void alertCalls;

  const service = new PrescriptionPdfService(prescriptionRepo, storage, {
    sendPrescriptionDocument: sendFn,
    whatsappClient: {},
    conversationStateRepository: conversationStateRepo,
    clinicRepository: clinicRepo,
    appointmentRepository: appointmentRepo,
    templatesLive,
  });

  return { service, draft, sendCalls, updates, uploads };
}

test("PrescriptionPdfService.deliverForApprovedDraft: generates PDF, uploads, sends WhatsApp with slot label + pdf URL", async () => {
  const { service, draft, sendCalls, updates, uploads } = makePdfServiceHarness();

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: "appt-1" },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.equal(result.prescriptionNumber, "RX-000007");
  assert.equal(result.storagePath, "clinic-1/appt-1.pdf");
  assert.equal(result.reused, false);
  assert.equal(uploads.length, 1);
  assert.equal(updates[0].fields.prescription_number, "RX-000007");
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].phoneNumberId, "PNID_1");
  assert.equal(sendCalls[0].patientPhone, "919876543210");
  assert.equal(sendCalls[0].pdfUrl, PDF_URL);
  assert.deepEqual(sendCalls[0].opts.bodyParams, [EXPECTED_SLOT_LABEL]);
  assert.equal(sendCalls[0].opts.filename, "RX-000007.pdf");
  assert.equal(sendCalls[0].opts.templatesLive, true);
  assert.equal(result.whatsapp.templateSent, true);
});

test("PrescriptionPdfService.deliverForApprovedDraft: reuses existing PDF and still sends WhatsApp", async () => {
  const { service, draft, sendCalls, uploads } = makePdfServiceHarness({
    existingNumber: "RX-000003",
    existingPath: "clinic-1/appt-1.pdf",
  });

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: "appt-1" },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.equal(result.reused, true);
  assert.equal(result.prescriptionNumber, "RX-000003");
  assert.equal(uploads.length, 0);
  assert.equal(sendCalls[0].pdfUrl, "https://storage.example/clinic-1/appt-1.pdf?sig=reuse");
  assert.equal(sendCalls[0].opts.filename, "RX-000003.pdf");
});

test("PrescriptionPdfService.deliverForApprovedDraft: WhatsApp send failure does not throw (best-effort)", async () => {
  const err = new Error("Meta rejected");
  err.details = { code: 131047, message: "session window closed", type: "OAuthException" };
  const { service, draft } = makePdfServiceHarness({
    lastMessageAt: "2020-01-01T00:00:00.000Z",
    sendThrows: err,
  });

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: "appt-1" },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.ok(result);
  assert.equal(result.prescriptionNumber, "RX-000007");
  assert.equal(result.whatsapp.failed, true);
  assert.equal(result.whatsapp.sessionWindowClosed, true);
});

test("PrescriptionPdfService.deliverForApprovedDraft: stubs WhatsApp when templatesLive=false", async () => {
  const { service, draft, sendCalls } = makePdfServiceHarness({ templatesLive: false });

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: "appt-1" },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.equal(sendCalls[0].opts.templatesLive, false);
  // sendFn still called by service; the real sendPrescriptionDocument stubs —
  // here our harness sendFn returns success. Point is templatesLive is forwarded.
  assert.ok(result.whatsapp);
});
