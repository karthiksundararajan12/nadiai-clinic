import test from "node:test";
import assert from "node:assert/strict";
import { PrescriptionPdfService } from "../services/prescription-pdf.service.js";
import { PrescriptionReviewService } from "../services/prescription-review.service.js";
import { SESSION_STATUS, PRESCRIPTION_DRAFT_STATUS } from "../constants.js";

function createPdfServiceHarness({
  appointmentId = "appt-1",
  existingNumber = null,
  existingPath = null,
  failAllocate = false,
} = {}) {
  const updates = [];
  const uploads = [];
  const signed = [];

  const draft = {
    id: "draft-1",
    session_id: "sess-1",
    appointment_id: appointmentId,
    status: PRESCRIPTION_DRAFT_STATUS.APPROVED,
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
    async allocateNextNumber(clinicId) {
      if (failAllocate) throw new Error("rpc failed");
      assert.equal(clinicId, "clinic-1");
      return { prescriptionSeq: 42, prescriptionNumber: "RX-000042" };
    },
    async getGenerationContext() {
      return {
        doctor: {
          full_name: "Dr. Rao",
          specialization: "GP",
          clinic_name: "Nadi Care",
          clinic_address: "12 MG Road",
          license_number: "MCI-1",
          phone: null,
        },
        patient: {
          name: "Asha",
          age: 34,
          date_of_birth: "1992-04-15",
        },
        appointment: {
          id: appointmentId,
          slot_start: "2026-07-22T03:30:00.000Z",
        },
      };
    },
    async getDoctorProfile() {
      return null;
    },
    async getClinicPhone() {
      return "+91 80 1234 5678";
    },
    async updateDraftFields(draftId, fields) {
      updates.push({ draftId, fields });
      Object.assign(draft, fields);
      return draft;
    },
  };

  const storage = {
    async createSignedUrl(path) {
      signed.push(path);
      return `https://storage.example/signed/${path}`;
    },
    async uploadPrescriptionPdf({ clinicId, appointmentId: apptId, pdfBytes }) {
      uploads.push({ clinicId, appointmentId: apptId, pdfBytes });
      return {
        storagePath: `${clinicId}/${apptId}.pdf`,
        pdfUrl: `https://storage.example/signed/${clinicId}/${apptId}.pdf`,
      };
    },
  };

  return {
    service: new PrescriptionPdfService(prescriptionRepo, storage),
    draft,
    updates,
    uploads,
    signed,
  };
}

test("PrescriptionPdfService.deliverForApprovedDraft: generates, uploads, persists Rx number", async () => {
  const { service, draft, updates, uploads } = createPdfServiceHarness();

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: "appt-1" },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.equal(result.prescriptionNumber, "RX-000042");
  assert.equal(result.storagePath, "clinic-1/appt-1.pdf");
  assert.equal(result.reused, false);
  assert.equal(uploads.length, 1);
  assert.ok(uploads[0].pdfBytes instanceof Uint8Array);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].fields.prescription_number, "RX-000042");
  assert.equal(updates[0].fields.prescription_seq, 42);
  assert.equal(updates[0].fields.pdf_storage_path, "clinic-1/appt-1.pdf");
});

test("PrescriptionPdfService.deliverForApprovedDraft: reuses existing PDF idempotently", async () => {
  const { service, draft, uploads, signed } = createPdfServiceHarness({
    existingNumber: "RX-000007",
    existingPath: "clinic-1/appt-1.pdf",
  });

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: "appt-1" },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.equal(result.prescriptionNumber, "RX-000007");
  assert.equal(result.reused, true);
  assert.equal(uploads.length, 0);
  assert.deepEqual(signed, ["clinic-1/appt-1.pdf"]);
});

test("PrescriptionPdfService.deliverForApprovedDraft: skips when appointment_id missing", async () => {
  const { service, draft } = createPdfServiceHarness({ appointmentId: null });
  draft.appointment_id = null;

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: null },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.equal(result, null);
});

test("PrescriptionPdfService.deliverForApprovedDraft: failures return null (do not throw)", async () => {
  const { service, draft } = createPdfServiceHarness({ failAllocate: true });

  const result = await service.deliverForApprovedDraft({
    session: { id: "sess-1", appointment_id: "appt-1" },
    draft,
    ctx: { clinicId: "clinic-1", doctorId: "doc-1" },
  });

  assert.equal(result, null);
});

test("PrescriptionReviewService.approve: hooks PDF delivery after approval", async () => {
  const pdfCalls = [];
  const session = {
    id: "sess-1",
    status: SESSION_STATUS.PRESCRIPTION_REVIEWING,
    appointment_id: "appt-1",
    doctor_id: "doc-1",
  };
  const draft = {
    id: "draft-1",
    session_id: "sess-1",
    status: "reviewing",
    draft: { medications: [], diagnosis: [], advice: [], warnings: [], investigations: [] },
    original_draft: null,
  };

  const sessions = {
    async findById() {
      return session;
    },
    async transitionStatus(_id, _doctorId, _from, to) {
      session.status = to;
      return { ...session, status: to };
    },
  };

  const prescriptions = {
    async getDraftBySession() {
      return draft;
    },
    async getReviewByDraft() {
      return { id: "review-1" };
    },
    async updateDraftFields(_id, fields) {
      Object.assign(draft, fields);
      return { ...draft, ...fields };
    },
    async updateReview() {
      return { id: "review-1" };
    },
    async insertReviewEvent() {
      return {};
    },
    async getNextVersionNumber() {
      return 1;
    },
    async createVersion(data) {
      return { id: "ver-1", version_number: data.version_number };
    },
  };

  const audit = {
    async log() {
      return {};
    },
  };

  const pdf = {
    async deliverForApprovedDraft(args) {
      pdfCalls.push(args);
      return {
        prescriptionNumber: "RX-000001",
        storagePath: "clinic-1/appt-1.pdf",
        pdfUrl: "https://x",
        reused: false,
      };
    },
  };

  const service = new PrescriptionReviewService(sessions, prescriptions, audit, pdf);
  const result = await service.approve(
    "sess-1",
    { create_version: false },
    { clinicId: "clinic-1", doctorId: "doc-1", actorId: "doc-1" },
  );

  assert.equal(result.session.status, SESSION_STATUS.PRESCRIPTION_APPROVED);
  assert.equal(result.draft.status, PRESCRIPTION_DRAFT_STATUS.APPROVED);
  assert.equal(pdfCalls.length, 1);
  assert.equal(pdfCalls[0].session.id, "sess-1");
  assert.equal(result.pdf.prescriptionNumber, "RX-000001");
});
