import test from "node:test";
import assert from "node:assert/strict";
import {
  SCRIBE_WORKFLOW_STEPS,
  resolveScribeWorkflowStepIndex,
} from "./scribe-workflow-step.js";

test("scribe workflow has five named steps", () => {
  assert.deepEqual(
    SCRIBE_WORKFLOW_STEPS.map((step) => step.label),
    ["Record", "Transcribe", "Generate Note", "Review & Edit", "Approve"],
  );
});

test("live recording stays on Record even if a prior session status exists", () => {
  assert.equal(
    resolveScribeWorkflowStepIndex({
      recordState: "recording",
      sessionStatus: "SOAP_REVIEWING",
    }),
    0,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ recordState: "paused" }),
    0,
  );
});

test("processing and transcription statuses map to Transcribe", () => {
  assert.equal(
    resolveScribeWorkflowStepIndex({ recordState: "processing" }),
    1,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({
      recordState: "idle",
      pipelineBusy: true,
    }),
    1,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "TRANSCRIBING" }),
    1,
  );
});

test("transcribed and generating statuses map to Generate Note", () => {
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "TRANSCRIBED" }),
    2,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "GENERATING_SOAP" }),
    2,
  );
});

test("SOAP ready / reviewing maps to Review & Edit until approved", () => {
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "SOAP_REVIEWING" }),
    3,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "SOAP_APPROVED" }),
    4,
  );
});
