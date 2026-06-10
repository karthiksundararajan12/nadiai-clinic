import test from "node:test";
import assert from "node:assert/strict";
import { TranscriptionProviderError } from "../errors.js";

// Mirror isRetryable from transcription.service.js
function isRetryable(err) {
  if (err?.code === "TRANSCRIPTION_NOT_READY") return false;
  if (err?.code === "VALIDATION_ERROR") return false;
  if (err?.code === "SESSION_NOT_FOUND") return false;

  if (err instanceof TranscriptionProviderError) {
    const status = Number(err.details?.status);
    if (status === 400 || status === 401 || status === 403 || status === 413) {
      return false;
    }
    const message = String(err.message ?? "").toLowerCase();
    if (
      message.includes("corrupt") ||
      message.includes("unsupported data") ||
      message.includes("invalid audio")
    ) {
      return false;
    }
  }

  return true;
}

test("Deepgram corrupt audio 400 is not retryable", () => {
  const err = new TranscriptionProviderError(
    'Deepgram API error 400: {"err_msg":"failed to process audio: corrupt or unsupported data"}',
    { status: 400 },
  );
  assert.equal(isRetryable(err), false);
});

test("transient provider 503 remains retryable", () => {
  const err = new TranscriptionProviderError("Deepgram API error 503: unavailable", {
    status: 503,
  });
  assert.equal(isRetryable(err), true);
});
