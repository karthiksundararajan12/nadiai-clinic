import test from "node:test";
import assert from "node:assert/strict";
import { JOB_STATUS } from "../constants.js";
import {
  buildInlineTranscriptionJob,
  failInlineTranscriptionJob,
  isInlineTranscriptionJob,
} from "../lib/transcription-jobs.js";

const ctx = { clinicId: "clinic-1", doctorId: "doctor-1" };

test("buildInlineTranscriptionJob uses inline id prefix", () => {
  const job = buildInlineTranscriptionJob("sess-1", 8, ctx);
  assert.equal(job.id, "inline:sess-1");
  assert.equal(job.session_id, "sess-1");
  assert.equal(job.status, JOB_STATUS.PENDING);
  assert.equal(job.metadata.inline, true);
  assert.ok(isInlineTranscriptionJob(job));
});

test("isInlineTranscriptionJob detects metadata.inline on persisted jobs", () => {
  assert.ok(isInlineTranscriptionJob({
    id: "550e8400-e29b-41d4-a716-446655440000",
    metadata: { inline: true },
  }));
  assert.equal(isInlineTranscriptionJob({ id: "550e8400-e29b-41d4-a716-446655440000" }), false);
});

test("failInlineTranscriptionJob retries until max attempts", () => {
  const job = buildInlineTranscriptionJob("sess-1", 5, ctx);
  const retry = failInlineTranscriptionJob(job, "network", true);
  assert.equal(retry.status, JOB_STATUS.PENDING);
  assert.equal(retry.attempt_count, 1);

  const failed = failInlineTranscriptionJob(
    { ...job, attempt_count: 2, max_attempts: 3 },
    "network",
    true,
  );
  assert.equal(failed.status, JOB_STATUS.FAILED);
});

test("failInlineTranscriptionJob does not retry when not retryable", () => {
  const job = buildInlineTranscriptionJob("sess-1", 5, ctx);
  const failed = failInlineTranscriptionJob(job, "bad audio", false);
  assert.equal(failed.status, JOB_STATUS.FAILED);
});
