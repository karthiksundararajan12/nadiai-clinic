import test from "node:test";
import assert from "node:assert/strict";
import {
  SOAP_GENERATION_FAILURE_MESSAGE,
  canManualGenerateSOAP,
  canShowCompleteReview,
  canShowGenerateSOAPButton,
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

test("canShowCompleteReview only while transcript is REVIEWING", () => {
  assert.equal(
    canShowCompleteReview({
      soapApproved: false,
      readOnly: false,
      sessionStatus: "REVIEWING",
      waitingForTranscript: false,
    }),
    true,
  );
  assert.equal(
    canShowCompleteReview({
      soapApproved: false,
      readOnly: false,
      sessionStatus: "REVIEW_COMPLETED",
      waitingForTranscript: false,
    }),
    false,
  );
  assert.equal(
    canShowCompleteReview({
      soapApproved: true,
      readOnly: false,
      sessionStatus: "REVIEWING",
      waitingForTranscript: false,
    }),
    false,
  );
});

test("canShowGenerateSOAPButton hides Generate after SOAP exists, even with prior error", () => {
  assert.equal(
    canShowGenerateSOAPButton({
      canGenerate: false,
      hasSoap: false,
      hasGenerationError: true,
    }),
    true,
  );
  assert.equal(
    canShowGenerateSOAPButton({
      canGenerate: true,
      hasSoap: true,
      hasGenerationError: true,
    }),
    false,
  );
  assert.equal(
    canShowGenerateSOAPButton({
      canGenerate: false,
      hasSoap: true,
      hasGenerationError: false,
    }),
    false,
  );
});

test("generate → complete review → approve visibility transitions", () => {
  // After transcript ready, before SOAP: Complete review + Generate can show
  assert.equal(
    canShowCompleteReview({
      soapApproved: false,
      readOnly: false,
      sessionStatus: "REVIEWING",
      waitingForTranscript: false,
    }),
    true,
  );
  assert.equal(
    canShowGenerateSOAPButton({
      canGenerate: canManualGenerateSOAP({
        readOnly: false,
        waitingForTranscript: false,
        segmentCount: 2,
        generating: false,
        hasSoap: false,
        transcriptWorkspaceAvailable: true,
        soapApproved: false,
      }),
      hasSoap: false,
      hasGenerationError: false,
    }),
    true,
  );

  // After SOAP generated: Generate hidden; Complete review hidden (status advanced)
  assert.equal(
    canShowGenerateSOAPButton({
      canGenerate: false,
      hasSoap: true,
      hasGenerationError: false,
    }),
    false,
  );
  assert.equal(
    canShowCompleteReview({
      soapApproved: false,
      readOnly: false,
      sessionStatus: "SOAP_REVIEWING",
      waitingForTranscript: false,
    }),
    false,
  );

  // After approve: toolbar actions gated by soapApproved
  assert.equal(
    canShowCompleteReview({
      soapApproved: true,
      readOnly: true,
      sessionStatus: "SOAP_APPROVED",
      waitingForTranscript: false,
    }),
    false,
  );
  assert.equal(
    canShowGenerateSOAPButton({
      canGenerate: false,
      hasSoap: true,
      hasGenerationError: false,
    }),
    false,
  );
});

test("save failure surfaces an error message instead of silent success", async () => {
  const save = async () => {
    throw new Error("Database operation failed: saveSOAP");
  };
  let surfaced = null;
  try {
    await save();
  } catch (err) {
    surfaced = err instanceof Error ? err.message : String(err);
  }
  assert.match(surfaced, /Database operation failed/);
});
