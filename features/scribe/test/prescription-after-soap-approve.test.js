import test from "node:test";
import assert from "node:assert/strict";
import { SOAPReviewService } from "../services/soap-review.service.js";
import { PrescriptionService } from "../services/prescription.service.js";
import { PRESCRIPTION_GENERATION_CONFIG, SESSION_STATUS, SOAP_NOTE_STATUS } from "../constants.js";
import { mockAuditService, mockCtx, mockSessionRepository } from "./helpers/mocks.js";

const TRUNCATED_JSON = `{
  "drugs": [
    {
      "name": "Dolo 650",
      "dose": "650mg",
      "frequency": "as needed (up to 3-4 times a day)",
      "duration": "5 days",
      "instructions": "after food`;

const COMPLETE_JSON = JSON.stringify({
  drugs: [
    {
      name: "Dolo 650",
      dose: "650mg",
      frequency: "1-0-1",
      duration: "5 days",
      instructions: "after food",
      confidence: 0.85,
    },
  ],
  advice: "Rest and fluids",
  followup_days: 5,
});

test("approving SOAP then immediately generating a prescription succeeds", async () => {
  const sessions = mockSessionRepository({
    id: "sess-1",
    doctor_id: "doctor-1",
    clinic_id: "clinic-1",
    status: SESSION_STATUS.SOAP_REVIEWING,
    language: "english",
    patient_id: null,
    appointment_id: null,
  });

  let note = {
    id: "soap-1",
    session_id: "sess-1",
    status: SOAP_NOTE_STATUS.REVIEWING,
    subjective: "Fever for two days",
    objective: "Temp 100F",
    assessment: "Viral fever",
    plan: "Rest and fluids",
    chief_complaint: "Fever",
    history_of_present_illness: "Two days of fever",
    clinical_summary: "Viral fever",
    note: { assessment: "Viral fever", plan: "Rest and fluids" },
    original_note: { assessment: "Viral fever", plan: "Rest and fluids" },
  };

  const soapRepo = {
    getNoteBySession: async () => ({ ...note }),
    updateNote: async (_id, patch) => {
      note = { ...note, ...patch };
      return { ...note };
    },
    insertEdit: async () => ({}),
  };

  const soapReview = new SOAPReviewService(sessions, soapRepo, mockAuditService(), null);
  const approved = await soapReview.approve("sess-1", { create_version: false }, mockCtx());

  assert.equal(approved.session.status, SESSION_STATUS.COMPLETED);
  assert.equal(approved.note.status, SOAP_NOTE_STATUS.APPROVED);

  /** @type {Array<Record<string, unknown>>} */
  const modelCalls = [];
  const ai = {
    name: "gemini",
    model: "gemini-2.5-flash",
    async generateStructuredJSON(params) {
      modelCalls.push(params);
      const reservesJsonBudget =
        params.thinkingBudget === 0
        && params.maxOutputTokens > 2048;
      return {
        provider: "gemini",
        model: "gemini-2.5-flash",
        text: reservesJsonBudget ? COMPLETE_JSON : TRUNCATED_JSON,
        response: { id: "gemini-1" },
        usage: { thoughtsTokenCount: reservesJsonBudget ? 0 : 1900, candidatesTokenCount: 199 },
      };
    },
  };

  const prescriptions = {
    getGenerationContext: async () => ({
      session: { ...sessions.current },
      soapNote: { ...note },
      patient: null,
      doctor: null,
      appointment: null,
      latestTranscriptVersion: null,
      latestWeightKg: null,
    }),
    getApprovedPrescriptionsForDoctor: async () => [],
    findReusableDraft: async () => null,
    upsertDraft: async (row) => ({ id: "draft-1", ...row }),
    getNextVersionNumber: async () => 1,
    createVersion: async (row) => ({ id: "rx-ver-1", ...row }),
  };

  const prescription = new PrescriptionService(
    sessions,
    prescriptions,
    mockAuditService(),
    ai,
  );

  const result = await prescription.generate("sess-1", {}, mockCtx());

  assert.equal(result.reused, false);
  assert.equal(result.draft.status, "draft_ready");
  assert.equal(result.draft.draft.medications[0].name, "Dolo 650");
  assert.equal(sessions.current.status, SESSION_STATUS.PRESCRIPTION_DRAFT_READY);
  assert.equal(modelCalls.length, 1);
  assert.equal(modelCalls[0].thinkingBudget, PRESCRIPTION_GENERATION_CONFIG.THINKING_BUDGET);
  assert.equal(modelCalls[0].maxOutputTokens, PRESCRIPTION_GENERATION_CONFIG.MAX_OUTPUT_TOKENS);
  assert.equal(PRESCRIPTION_GENERATION_CONFIG.THINKING_BUDGET, 0);
  assert.ok(PRESCRIPTION_GENERATION_CONFIG.MAX_OUTPUT_TOKENS > 2048);
});
