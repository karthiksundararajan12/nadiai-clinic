import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { InvoiceService } from "../services/invoice.service.js";
import { sendInvoiceDocument } from "../services/invoice-whatsapp.js";
import {
  INVOICE_WHATSAPP_TEMPLATE_NAME,
  INVOICE_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
  INVOICE_WHATSAPP_TEMPLATE_BODY,
} from "../constants.js";
import { formatSlotLabel } from "../lib/slot-engine.js";

const CLINIC = {
  id: "clinic-1",
  name: "Nadi Care Clinic",
  address: "12 MG Road",
  whatsapp_phone_number_id: "PNID_1",
};
const PATIENT = { id: "patient-1", full_name: "Asha Kumar" };
const DOCTOR = { id: "doctor-1", full_name: "Dr. Rao" };
const APPOINTMENT = {
  id: "appt-1",
  patient_id: "patient-1",
  contact_phone: "919876543210",
  slot_start: "2026-07-06T03:30:00.000Z",
  payment_amount: 500,
};

const EXPECTED_SLOT_LABEL = formatSlotLabel(new Date(APPOINTMENT.slot_start));
const PDF_URL = "https://storage.example/invoices/clinic-1/appt-1.pdf?sig=1";

function makeDeps({ existingInvoice = null, templatesLive = true } = {}) {
  const allocateCalls = [];
  const insertCalls = [];
  const uploadCalls = [];
  const sendCalls = [];

  const invoiceRepo = {
    async findByAppointment() {
      return existingInvoice;
    },
    async allocateNextNumber(clinicId) {
      allocateCalls.push(clinicId);
      return { invoiceSeq: 7, invoiceNumber: "INV-000007" };
    },
    async insert(row) {
      insertCalls.push(row);
      return { id: "inv-1", ...row };
    },
  };

  const invoiceStorage = {
    async uploadInvoicePdf(params) {
      uploadCalls.push(params);
      const loaded = await PDFDocument.load(params.pdfBytes);
      assert.equal(loaded.getPageCount(), 1);
      return {
        storagePath: `invoices/${params.clinicId}/${params.appointmentId}.pdf`,
        pdfUrl: PDF_URL,
      };
    },
    async createSignedUrl(storagePath) {
      return `https://storage.example/${storagePath}?sig=reuse`;
    },
  };

  const clinicRepo = { async findById() { return CLINIC; } };
  const patientRepo = {
    async findById(clinicId, patientId) {
      assert.equal(clinicId, "clinic-1");
      assert.equal(patientId, "patient-1");
      return PATIENT;
    },
  };
  const doctorRepo = {
    async findPrimaryByClinicId(clinicId) {
      assert.equal(clinicId, "clinic-1");
      return DOCTOR;
    },
  };

  async function sendFn(phoneNumberId, patientPhone, pdfUrl, opts) {
    sendCalls.push({ phoneNumberId, patientPhone, pdfUrl, opts });
    return { templateName: INVOICE_WHATSAPP_TEMPLATE_NAME, templateSent: true, documentSent: true };
  }

  const service = new InvoiceService(
    invoiceRepo,
    invoiceStorage,
    clinicRepo,
    patientRepo,
    doctorRepo,
    { sendInvoiceDocument: sendFn, templatesLive },
  );

  return { service, allocateCalls, insertCalls, uploadCalls, sendCalls };
}

test("INVOICE_WHATSAPP_TEMPLATE_BODY matches Meta-approved appt_invoice body", () => {
  assert.equal(INVOICE_WHATSAPP_TEMPLATE_NAME, "appt_invoice");
  assert.equal(INVOICE_WHATSAPP_TEMPLATE_LANGUAGE_CODE, "en");
  assert.equal(
    INVOICE_WHATSAPP_TEMPLATE_BODY,
    "Your invoice for the appointment on {{1}} is attached.",
  );
  assert.match(INVOICE_WHATSAPP_TEMPLATE_BODY, /\{\{1\}\}/);
  assert.equal((INVOICE_WHATSAPP_TEMPLATE_BODY.match(/\{\{\d+\}\}/g) || []).length, 1);
});

test("InvoiceService.deliverForConfirmedAppointment: generates PDF, uploads, records ledger, sends WhatsApp with slot label + pdf URL", async () => {
  const { service, allocateCalls, insertCalls, uploadCalls, sendCalls } = makeDeps();

  const result = await service.deliverForConfirmedAppointment({
    clinicId: "clinic-1",
    appointment: APPOINTMENT,
    razorpayPaymentId: "pay_1",
  });

  assert.equal(result.invoiceNumber, "INV-000007");
  assert.equal(result.storagePath, "invoices/clinic-1/appt-1.pdf");
  assert.equal(result.reused, false);
  assert.deepEqual(allocateCalls, ["clinic-1"]);
  assert.equal(uploadCalls.length, 1);
  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].invoiceNumber, "INV-000007");
  assert.equal(insertCalls[0].razorpayPaymentId, "pay_1");
  assert.equal(insertCalls[0].amount, 500);
  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0].phoneNumberId, "PNID_1");
  assert.equal(sendCalls[0].patientPhone, "919876543210");
  assert.equal(sendCalls[0].pdfUrl, PDF_URL);
  assert.deepEqual(sendCalls[0].opts.bodyParams, [EXPECTED_SLOT_LABEL]);
  assert.equal(sendCalls[0].opts.filename, "INV-000007.pdf");
  assert.equal(sendCalls[0].opts.templatesLive, true);
});

test("InvoiceService.deliverForConfirmedAppointment: reuses existing invoice without allocating a new number", async () => {
  const { service, allocateCalls, insertCalls, sendCalls } = makeDeps({
    existingInvoice: {
      invoice_number: "INV-000003",
      storage_path: "invoices/clinic-1/appt-1.pdf",
      razorpay_payment_id: "pay_old",
    },
  });

  const result = await service.deliverForConfirmedAppointment({
    clinicId: "clinic-1",
    appointment: APPOINTMENT,
    razorpayPaymentId: "pay_1",
  });

  assert.equal(result.reused, true);
  assert.equal(result.invoiceNumber, "INV-000003");
  assert.equal(allocateCalls.length, 0);
  assert.equal(insertCalls.length, 0);
  assert.equal(sendCalls[0].pdfUrl, "https://storage.example/invoices/clinic-1/appt-1.pdf?sig=reuse");
  assert.equal(sendCalls[0].opts.filename, "INV-000003.pdf");
  assert.deepEqual(sendCalls[0].opts.bodyParams, [EXPECTED_SLOT_LABEL]);
});

test("sendInvoiceDocument: WHATSAPP_TEMPLATES_LIVE=false stubs and does not call Meta", async () => {
  const templateCalls = [];
  const documentCalls = [];
  const wa = {
    async sendTemplate(...args) { templateCalls.push(args); },
    async sendDocument(...args) { documentCalls.push(args); },
  };

  const result = await sendInvoiceDocument("PNID", "919876543210", PDF_URL, {
    whatsappClient: wa,
    bodyParams: [EXPECTED_SLOT_LABEL],
    filename: "INV-000001.pdf",
    templatesLive: false,
  });

  assert.equal(result.stubbed, true);
  assert.equal(result.templateName, INVOICE_WHATSAPP_TEMPLATE_NAME);
  assert.equal(templateCalls.length, 0);
  assert.equal(documentCalls.length, 0);
});

test("sendInvoiceDocument: live send calls sendTemplate then sendDocument with phone, URL, and {{1}} slot label", async () => {
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

  const result = await sendInvoiceDocument("PNID_1", "919876543210", PDF_URL, {
    whatsappClient: wa,
    bodyParams: [EXPECTED_SLOT_LABEL],
    filename: "INV-000007.pdf",
    templatesLive: true,
  });

  assert.equal(result.templateSent, true);
  assert.equal(result.documentSent, true);
  assert.equal(templateCalls.length, 1);
  assert.equal(templateCalls[0].phoneNumberId, "PNID_1");
  assert.equal(templateCalls[0].toPhone, "919876543210");
  assert.equal(templateCalls[0].opts.templateName, INVOICE_WHATSAPP_TEMPLATE_NAME);
  assert.equal(templateCalls[0].opts.languageCode, INVOICE_WHATSAPP_TEMPLATE_LANGUAGE_CODE);
  assert.deepEqual(templateCalls[0].opts.bodyParams, [EXPECTED_SLOT_LABEL]);
  assert.equal(templateCalls[0].opts.headerDocument, undefined);

  assert.equal(documentCalls.length, 1);
  assert.equal(documentCalls[0].phoneNumberId, "PNID_1");
  assert.equal(documentCalls[0].toPhone, "919876543210");
  assert.equal(documentCalls[0].opts.link, PDF_URL);
  assert.equal(documentCalls[0].opts.filename, "INV-000007.pdf");
});
