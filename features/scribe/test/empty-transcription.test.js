import test from "node:test";
import assert from "node:assert/strict";
import { assertCapturedTranscript, isRetryable } from "../services/transcription.service.js";
import { EmptyTranscriptionError } from "../errors.js";

test("an empty provider result is a visible transcription failure, not a transcript", () => {
  assert.throws(
    () => assertCapturedTranscript({ text: "", segments: [] }),
    (err) => err instanceof EmptyTranscriptionError,
  );
  assert.equal(isRetryable(new EmptyTranscriptionError()), false);
  assert.doesNotThrow(() => assertCapturedTranscript({
    text: "The patient has had a fever for three days.",
    segments: [{ text: "The patient has had a fever for three days." }],
  }));
});
