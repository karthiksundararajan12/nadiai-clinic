import test from "node:test";
import assert from "node:assert/strict";
import { PrescriptionReviewService } from "../services/prescription-review.service.js";
import { SESSION_STATUS } from "../constants.js";
import { PediatricDoseBlockedError } from "../errors.js";
import { PEDIATRIC_DOSE_REASON } from "./pediatric-dosage-calculator.js";

function createReviewHarness(draftJson) {
  const session = {
    id: "sess-1",
    status: SESSION_STATUS.PRESCRIPTION_REVIEWING,
    appointment_id: "appt-1",
    doctor_id: "doc-1",
    patient_id: "patient-1",
  };
  const draft = {
    id: "draft-1",
    session_id: "sess-1",
    patient_id: "patient-1",
    status: "reviewing",
    draft: draftJson,
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
    async updateDraftFields() {
      throw new Error("should not persist approval when pediatric dose is blocked");
    },
    async updateReview() {
      throw new Error("should not update review when pediatric dose is blocked");
    },
    async insertReviewEvent() {
      return {};
    },
  };
  const auditCalls = [];
  const audit = {
    async log(payload) {
      auditCalls.push(payload);
      return {};
    },
  };
  return {
    service: new PrescriptionReviewService(sessions, prescriptions, audit, null),
    auditCalls,
  };
}

test("approve hard-blocks leftover calculated over-max pediatric doses", async () => {
  const { service, auditCalls } = createReviewHarness({
    medications: [
      {
        name: "Paracetamol",
        dosage: "",
        frequency: "TDS",
        duration: "3 days",
        instructions: "",
        confidence: 0.8,
        pediatricDose: {
          status: "blocked",
          reason: PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY,
          label: "exceeds max",
          dailyDoseMg: 4050,
          maxDailyDoseMg: 4000,
          overridden: false,
        },
      },
    ],
    diagnosis: [],
    advice: [],
    warnings: [],
    investigations: [],
  });

  await assert.rejects(
    () =>
      service.approve(
        "sess-1",
        { create_version: false },
        { clinicId: "clinic-1", doctorId: "doc-1", actorId: "doc-1" },
      ),
    PediatricDoseBlockedError,
  );
  assert.equal(
    auditCalls.some((call) => call.action === "pediatric_dose_blocked"),
    true,
  );
});
