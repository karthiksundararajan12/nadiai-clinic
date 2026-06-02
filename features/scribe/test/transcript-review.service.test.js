import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptReviewService } from "../services/transcript-review.service.js";
import { SESSION_STATUS } from "../constants.js";
import {
  SessionFinalizedError,
  SessionNotFoundError,
  TranscriptionNotReadyError,
} from "../errors.js";
import {
  mockAuditService,
  mockCtx,
  mockReviewRepository,
  mockSessionRepository,
} from "./helpers/mocks.js";

const workspace = {
  transcription: { id: "tx-1" },
  segments: [{ id: "seg-1", text: "hello", speaker_label: "Doctor" }],
  versions: [],
};

test("getWorkspace transitions TRANSCRIBED to REVIEWING", async () => {
  const sessions = mockSessionRepository({
    id: "sess-1",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.TRANSCRIBED,
  });
  const svc = new TranscriptReviewService(sessions, mockReviewRepository(workspace), mockAuditService());
  const result = await svc.getWorkspace("sess-1", mockCtx());

  assert.equal(result.readOnly, false);
  assert.equal(result.session.status, SESSION_STATUS.REVIEWING);
  assert.equal(sessions.current.status, SESSION_STATUS.REVIEWING);
});

test("getWorkspace returns readOnly for COMPLETED without status change", async () => {
  const sessions = mockSessionRepository({
    id: "sess-1",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.COMPLETED,
  });
  const svc = new TranscriptReviewService(sessions, mockReviewRepository(workspace), mockAuditService());
  const result = await svc.getWorkspace("sess-1", mockCtx());

  assert.equal(result.readOnly, true);
  assert.equal(result.session.status, SESSION_STATUS.COMPLETED);
});

test("getWorkspace throws TranscriptionNotReadyError for UPLOADED", async () => {
  const sessions = mockSessionRepository({
    id: "sess-1",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.UPLOADED,
  });
  const svc = new TranscriptReviewService(sessions, mockReviewRepository(workspace), mockAuditService());

  await assert.rejects(
    () => svc.getWorkspace("sess-1", mockCtx()),
    TranscriptionNotReadyError,
  );
});

test("getWorkspace throws SessionNotFoundError for missing session", async () => {
  const sessions = mockSessionRepository({
    id: "sess-1",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.COMPLETED,
  });
  const svc = new TranscriptReviewService(sessions, mockReviewRepository(workspace), mockAuditService());

  await assert.rejects(
    () => svc.getWorkspace("missing", mockCtx()),
    SessionNotFoundError,
  );
});

test("updateSegment on COMPLETED throws SessionFinalizedError", async () => {
  const sessions = mockSessionRepository({
    id: "sess-1",
    doctor_id: "doctor-1",
    status: SESSION_STATUS.COMPLETED,
  });
  const svc = new TranscriptReviewService(sessions, mockReviewRepository(workspace), mockAuditService());

  await assert.rejects(
    () => svc.updateSegment("sess-1", "seg-1", { text: "changed" }, mockCtx()),
    SessionFinalizedError,
  );
});
