import test from "node:test";
import assert from "node:assert/strict";
import {
  SCRIBE_WORKFLOW_STEPS,
  resolveScribeWorkflowStepIndex,
  resolveScribeWorkflowStepVisual,
} from "./scribe-workflow-step.js";

test("scribe workflow ends at Prescription", () => {
  assert.deepEqual(
    SCRIBE_WORKFLOW_STEPS.map((step) => step.label),
    ["Record", "Transcribe", "Note", "Prescription"],
  );
  assert.equal(SCRIBE_WORKFLOW_STEPS.some((step) => step.id === "approve"), false);
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

test("transcript and SOAP review stay on Note", () => {
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "TRANSCRIBED" }),
    2,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "GENERATING_SOAP" }),
    2,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "SOAP_REVIEWING" }),
    2,
  );
});

test("SOAP approval opens Prescription and does not finish the stepper", () => {
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "SOAP_APPROVED" }),
    3,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "COMPLETED" }),
    3,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "GENERATING_PRESCRIPTION" }),
    3,
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({ sessionStatus: "PRESCRIPTION_DRAFT_READY" }),
    3,
  );
});

test("approving the prescription completes Prescription as the last step", () => {
  const activeIndex = resolveScribeWorkflowStepIndex({
    sessionStatus: "PRESCRIPTION_APPROVED",
  });
  assert.equal(activeIndex, SCRIBE_WORKFLOW_STEPS.length);
  assert.deepEqual(
    SCRIBE_WORKFLOW_STEPS.map((_, index) => resolveScribeWorkflowStepVisual(index, activeIndex)),
    ["done", "done", "done", "done"],
  );
  assert.equal(
    resolveScribeWorkflowStepIndex({
      sessionStatus: "PRESCRIPTION_DRAFT_READY",
      prescriptionApproved: true,
    }),
    SCRIBE_WORKFLOW_STEPS.length,
  );
});

test("an in-progress prescription leaves only Prescription current", () => {
  assert.deepEqual(
    SCRIBE_WORKFLOW_STEPS.map((_, index) => resolveScribeWorkflowStepVisual(index, 3)),
    ["done", "done", "done", "current"],
  );
});
