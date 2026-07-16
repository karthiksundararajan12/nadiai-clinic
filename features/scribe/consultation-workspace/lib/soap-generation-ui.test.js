import test from "node:test";
import assert from "node:assert/strict";
import {
  SOAP_GENERATION_FAILURE_MESSAGE,
  canManualGenerateSOAP,
  resolveSoapEmptyPresentation,
  runSoapGenerationAttempt,
} from "./soap-generation-ui.js";

test("resolveSoapEmptyPresentation shows error (not idle) when transcript exists and generation failed", () => {
  const result = resolveSoapEmptyPresentation({
    hasTranscript: true,
    generating: false,
    error: new Error("Gemini API error 503"),
  });

  assert.equal(result.variant, "error");
  assert.equal(result.message, SOAP_GENERATION_FAILURE_MESSAGE);
  assert.equal(result.showRetry, true);
});

test("resolveSoapEmptyPresentation shows idle when there is no transcript", () => {
  const result = resolveSoapEmptyPresentation({
    hasTranscript: false,
    generating: false,
    error: null,
  });

  assert.equal(result.variant, "idle");
  assert.match(result.message, /Start a recording/i);
});

test("canManualGenerateSOAP allows retry after failure when transcript is ready", () => {
  assert.equal(
    canManualGenerateSOAP({
      readOnly: false,
      waitingForTranscript: false,
      segmentCount: 3,
      generating: false,
      hasSoap: false,
      transcriptWorkspaceAvailable: true,
      soapApproved: false,
    }),
    true,
  );
});

test("runSoapGenerationAttempt retry re-attempts generation after initial failure", async () => {
  let attempts = 0;

  const generate = async () => {
    attempts += 1;
    if (attempts === 1) {
      throw new Error("Gemini failed");
    }
  };

  const first = await runSoapGenerationAttempt(generate);
  assert.equal(first.ok, false);
  assert.equal(attempts, 1);
  if (first.ok) throw new Error("expected failure");

  const second = await runSoapGenerationAttempt(generate);
  assert.equal(second.ok, true);
  assert.equal(attempts, 2);
});
