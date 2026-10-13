import { SESSION_STATUS } from "../../constants.js";

export const SCRIBE_WORKFLOW_STEPS = Object.freeze([
  { id: "record", label: "Record" },
  { id: "transcribe", label: "Transcribe" },
  { id: "note", label: "Note" },
  { id: "prescription", label: "Prescription" },
]);

/** SOAP note is written and reviewed here. Prescription starts only after SOAP approval. */
const NOTE_STATUSES = new Set([
  SESSION_STATUS.TRANSCRIBED,
  SESSION_STATUS.REVIEWING,
  SESSION_STATUS.REVIEW_COMPLETED,
  SESSION_STATUS.READY_FOR_SOAP,
  SESSION_STATUS.GENERATING_SOAP,
  SESSION_STATUS.SOAP_READY,
  SESSION_STATUS.SOAP_REVIEW_REQUIRED,
  SESSION_STATUS.SOAP_REVIEWING,
]);

/**
 * Prescription is the active last step from SOAP approval through draft review.
 * SOAP approval currently lands on COMPLETED before a prescription exists, so
 * COMPLETED stays on this step instead of marking the workflow finished.
 */
const PRESCRIPTION_STATUSES = new Set([
  SESSION_STATUS.SOAP_APPROVED,
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.READY_FOR_PRESCRIPTION,
  SESSION_STATUS.GENERATING_PRESCRIPTION,
  SESSION_STATUS.PRESCRIPTION_DRAFT_READY,
  SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED,
  SESSION_STATUS.PRESCRIPTION_REVIEWING,
]);

const TRANSCRIBE_STATUSES = new Set([
  SESSION_STATUS.UPLOADING,
  SESSION_STATUS.UPLOADED,
  SESSION_STATUS.TRANSCRIPTION_QUEUED,
  SESSION_STATUS.TRANSCRIBING,
  SESSION_STATUS.TRANSCRIPTION_FAILED,
]);

/**
 * Maps live record state + session status onto Record, Transcribe, Note, Prescription.
 * An index equal to the step count means every step, including Prescription, is done.
 * That happens only after the prescription itself is approved.
 *
 * @param {{
 *   recordState?: string;
 *   sessionStatus?: string | null;
 *   pipelineBusy?: boolean;
 *   prescriptionApproved?: boolean;
 * }} input
 * @returns {number}
 */
export function resolveScribeWorkflowStepIndex({
  recordState = "idle",
  sessionStatus = null,
  pipelineBusy = false,
  prescriptionApproved = false,
} = {}) {
  if (
    recordState === "recording" ||
    recordState === "paused" ||
    recordState === "requesting"
  ) {
    return 0;
  }

  const status = sessionStatus ?? "";
  if (prescriptionApproved || status === SESSION_STATUS.PRESCRIPTION_APPROVED) {
    return SCRIBE_WORKFLOW_STEPS.length;
  }
  if (PRESCRIPTION_STATUSES.has(status)) return 3;
  if (NOTE_STATUSES.has(status)) return 2;
  if (pipelineBusy || recordState === "processing" || TRANSCRIBE_STATUSES.has(status)) {
    return 1;
  }
  return 0;
}

/**
 * @param {number} stepIndex
 * @param {number} activeIndex
 * @returns {"done" | "current" | "upcoming"}
 */
export function resolveScribeWorkflowStepVisual(stepIndex, activeIndex) {
  const index = Math.max(activeIndex, 0);
  if (index >= SCRIBE_WORKFLOW_STEPS.length || stepIndex < index) return "done";
  if (stepIndex === index) return "current";
  return "upcoming";
}
