import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptionService } from "../services/transcription.service.js";
import { SESSION_STATUS, TRANSCRIPTION_STATUS } from "../constants.js";
import { DatabaseError } from "../errors.js";
import { mockAuditService, mockCtx } from "./helpers/mocks.js";
import { isInlineTranscriptionJob } from "../lib/transcription-jobs.js";

function mockProvider() {
  return { name: "mock", model: "test", transcribe: async () => ({ segments: [] }) };
}

test("queueSession uses inline job when enqueue fails", async () => {
  const session = {
    id: "sess-1",
    doctor_id: "doctor-1",
    clinic_id: "clinic-1",
    status: SESSION_STATUS.UPLOADED,
    language: "english",
  };

  let current = { ...session };
  const sessions = {
    findById: async () => ({ ...current }),
    transitionStatus: async (_id, _doc, from, to) => {
      current = { ...current, status: to };
      assert.equal(from, SESSION_STATUS.UPLOADED);
      return { ...current };
    },
  };

  const transcriptions = {
    findBySession: async () => null,
    upsertTranscription: async (row) => ({ id: "tx-1", ...row }),
    enqueue: async () => {
      throw new DatabaseError("enqueueTranscription", { code: "42501" });
    },
  };

  const svc = new TranscriptionService(
    {},
    sessions,
    transcriptions,
    mockAuditService(),
    mockProvider(),
  );

  const result = await svc.queueSession("sess-1", {}, mockCtx());

  assert.equal(result.queued, true);
  assert.ok(isInlineTranscriptionJob(result.job));
  assert.equal(result.session.status, SESSION_STATUS.TRANSCRIPTION_QUEUED);
  assert.equal(result.transcription.status, TRANSCRIPTION_STATUS.QUEUED);
});

test("queueSession is idempotent when already queued", async () => {
  const session = {
    id: "sess-1",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.TRANSCRIPTION_QUEUED,
  };
  const sessions = { findById: async () => session };
  const transcriptions = {
    findBySession: async () => ({ id: "tx-1" }),
    enqueue: async () => { throw new Error("should not enqueue"); },
  };

  const svc = new TranscriptionService({}, sessions, transcriptions, mockAuditService(), mockProvider());
  const result = await svc.queueSession("sess-1", {}, mockCtx());

  assert.equal(result.queued, false);
  assert.equal(result.reason, "already_queued_or_processing");
});
