import test from "node:test";
import assert from "node:assert/strict";
import { SOAPGenerationService } from "../services/soap-generation.service.js";
import { buildSOAPPrompt } from "../services/soap-prompt.js";
import {
  TranscriptRelevanceClassifier,
  parseAndValidateRelevance,
} from "../services/transcript-relevance.service.js";
import {
  formatTurnsAsTranscriptText,
  selectTurnsForSoap,
} from "../lib/soap-transcript-filter.js";
import { SESSION_STATUS } from "../constants.js";
import { mockAuditService, mockCtx, mockSessionRepository } from "./helpers/mocks.js";

const TURNS = [
  { id: "turn-clinical", speaker_label: "Patient", text: "I have chest pain for two days." },
  { id: "turn-chatter", speaker_label: "Doctor", text: "Did you watch the cricket match last night?" },
  { id: "turn-plan", speaker_label: "Doctor", text: "Start pantoprazole 40 mg once daily." },
];

function validSoapJson() {
  return JSON.stringify({
    subjective: "Chest pain for 2 days.",
    objective: "Not documented in transcript.",
    assessment: "Likely acid peptic disease.",
    plan: "- Pantoprazole 40 mg once daily",
    chiefComplaint: "Chest pain x2 days.",
    historyOfPresentIllness: "Chest pain for two days.",
    clinicalSummary: "Chest pain, started on pantoprazole.",
  });
}

test("parseAndValidateRelevance maps each turn id to a boolean", () => {
  const parsed = parseAndValidateRelevance(
    JSON.stringify({
      turns: [
        { id: "turn-clinical", clinical: true },
        { id: "turn-chatter", clinical: false },
        { id: "turn-plan", clinical: true },
      ],
    }),
    TURNS,
  );
  assert.deepEqual(parsed, [
    { id: "turn-clinical", clinical: true },
    { id: "turn-chatter", clinical: false },
    { id: "turn-plan", clinical: true },
  ]);
});

test("parseAndValidateRelevance throws on truncated JSON", () => {
  assert.throws(
    () => parseAndValidateRelevance('{"turns":[{"id":"turn-clinical","clinical":tru', TURNS),
    (err) => err instanceof Error && err.message === "invalid_json" && err.looksTruncated === true,
  );
});

test("classifier fail-open treats every turn as clinical when the model errors", async () => {
  const warnings = [];
  const classifier = new TranscriptRelevanceClassifier({
    aiProvider: {
      async generateStructuredJSON() {
        throw new Error("Gemini unavailable");
      },
    },
    log: {
      warn(message, meta) {
        warnings.push({ message, meta });
      },
    },
  });

  const result = await classifier.classify(TURNS);
  assert.deepEqual(
    result,
    TURNS.map((turn) => ({ id: turn.id, clinical: true })),
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /treating all turns as clinical/);
});

test("classifier fail-open when parsed JSON is invalid", async () => {
  const classifier = new TranscriptRelevanceClassifier({
    aiProvider: {
      async generateStructuredJSON() {
        return { text: '{"turns":[]}' };
      },
    },
    log: { warn() {} },
  });

  const result = await classifier.classify(TURNS);
  assert.equal(result.every((row) => row.clinical === true), true);
  assert.equal(result.length, TURNS.length);
});

test("excluded turns never reach the SOAP prompt", () => {
  const included = selectTurnsForSoap({
    turns: TURNS,
    classifications: [
      { id: "turn-clinical", clinical: true },
      { id: "turn-chatter", clinical: false },
      { id: "turn-plan", clinical: true },
    ],
  });
  const prompt = buildSOAPPrompt({
    patient: {},
    doctor: {},
    consultation: {},
    transcriptText: formatTurnsAsTranscriptText(included),
  });
  const userContent = prompt.find((message) => message.role === "user")?.content ?? "";
  assert.match(userContent, /chest pain/i);
  assert.match(userContent, /pantoprazole/i);
  assert.equal(userContent.includes("cricket match"), false);
});

test("deleted turn is removed from SOAP input", () => {
  const included = selectTurnsForSoap({
    turns: TURNS,
    classifications: TURNS.map((turn) => ({ id: turn.id, clinical: true })),
    deletedIds: ["turn-chatter"],
  });
  assert.deepEqual(
    included.map((turn) => turn.id),
    ["turn-clinical", "turn-plan"],
  );
  const text = formatTurnsAsTranscriptText(included);
  assert.equal(text.includes("cricket match"), false);
  assert.match(text, /chest pain/i);
});

test("SOAP generation prompt omits classifier-excluded and deleted turns", async () => {
  const captured = [];
  const sessions = mockSessionRepository({
    id: "sess-1",
    doctor_id: "doctor-1",
    clinic_id: "clinic-1",
    patient_id: null,
    appointment_id: null,
    language: "english",
    status: SESSION_STATUS.REVIEW_COMPLETED,
  });
  const transcriptVersion = {
    id: "tv-1",
    session_id: "sess-1",
    version_number: 1,
    full_text: TURNS.map((turn) => `${turn.speaker_label}: ${turn.text}`).join("\n"),
  };
  const soapRepo = {
    async getGenerationContext() {
      return {
        session: sessions.current,
        patient: null,
        doctor: null,
        appointment: null,
        latestTranscriptVersion: transcriptVersion,
        segments: TURNS,
      };
    },
    async getTranscriptVersion() {
      return transcriptVersion;
    },
    async findReusableNote() {
      return null;
    },
    async getNoteBySession() {
      return null;
    },
    async upsertNote(row) {
      return { id: "note-1", ...row };
    },
    async getVersions() {
      return [];
    },
    async getNextVersionNumber() {
      return 1;
    },
    async createVersion(row) {
      return { id: "ver-1", ...row };
    },
  };
  const svc = new SOAPGenerationService(
    sessions,
    soapRepo,
    mockAuditService(),
    {
      name: "gemini",
      model: "test",
      async generateStructuredJSON({ input }) {
        captured.push(input);
        return { provider: "gemini", model: "test", text: validSoapJson(), response: {}, usage: null };
      },
    },
    {
      async classify() {
        return [
          { id: "turn-clinical", clinical: true },
          { id: "turn-chatter", clinical: false },
          { id: "turn-plan", clinical: true },
        ];
      },
    },
  );

  await svc.generate(
    "sess-1",
    { deleted_segment_ids: ["turn-plan"] },
    mockCtx(),
  );

  const userContent = captured[0].find((message) => message.role === "user")?.content ?? "";
  assert.match(userContent, /chest pain/i);
  assert.equal(userContent.includes("cricket match"), false);
  assert.equal(userContent.includes("pantoprazole"), false);
});
