import test from "node:test";
import assert from "node:assert/strict";
import { PrescriptionReviewService } from "../services/prescription-review.service.js";
import { SESSION_STATUS, PRESCRIPTION_DRAFT_STATUS } from "../constants.js";

test("PrescriptionReviewService.approve: hooks PDF delivery (incl. WhatsApp) after approval", async () => {
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
    async findById() { return session; },
    async transitionStatus(_id, _doctorId, _from, to) {
      session.status = to;
      return { ...session, status: to };
    },
  };

  const prescriptions = {
    async getDraftBySession() { return draft; },
    async getReviewByDraft() { return { id: "review-1" }; },
    async updateDraftFields(_id, fields) {
      Object.assign(draft, fields);
      return { ...draft, ...fields };
    },
    async updateReview() { return { id: "review-1" }; },
    async insertReviewEvent() { return {}; },
    async getNextVersionNumber() { return 1; },
    async createVersion(data) {
      return { id: "ver-1", version_number: data.version_number };
    },
  };

  const audit = { async log() { return {}; } };

  const pdf = {
    async deliverForApprovedDraft(args) {
      pdfCalls.push(args);
      return {
        prescriptionNumber: "RX-000001",
        storagePath: "clinic-1/appt-1.pdf",
        pdfUrl: "https://x",
        reused: false,
        whatsapp: { templateSent: true, documentSent: true },
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
  assert.equal(result.pdf.whatsapp.templateSent, true);
});
