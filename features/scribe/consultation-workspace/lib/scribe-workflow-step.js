import { SESSION_STATUS } from "../../constants.js";

export const SCRIBE_WORKFLOW_STEPS = Object.freeze([
  { id: "record", label: "Record" },
  { id: "transcribe", label: "Transcribe" },
  { id: "generate", label: "Generate Note" },
  { id: "review", label: "Review & Edit" },
  { id: "approve", label: "Approve" },
]);

const APPROVED_STATUSES = new Set([
  SESSION_STATUS.SOAP_APPROVED,
  SESSION_STATUS.COMPLETED,
  SESSION_STATUS.READY_FOR_PRESCRIPTION,
  SESSION_STATUS.GENERATING_PRESCRIPTION,
  SESSION_STATUS.PRESCRIPTION_DRAFT_READY,
  SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED,
  SESSION_STATUS.PRESCRIPTION_REVIEWING,
  SESSION_STATUS.PRESCRIPTION_APPROVED,
]);

const REVIEW_STATUSES = new Set([
  SESSION_STATUS.SOAP_READY,
  SESSION_STATUS.SOAP_REVIEW_REQUIRED,
  SESSION_STATUS.SOAP_REVIEWING,
]);

const GENERATE_STATUSES = new Set([
  SESSION_STATUS.TRANSCRIBED,
  SESSION_STATUS.REVIEWING,
  SESSION_STATUS.REVIEW_COMPLETED,
  SESSION_STATUS.READY_FOR_SOAP,
  SESSION_STATUS.GENERATING_SOAP,
]);

const TRANSCRIBE_STATUSES = new Set([
  SESSION_STATUS.UPLOADING,
  SESSION_STATUS.UPLOADED,
  SESSION_STATUS.TRANSCRIPTION_QUEUED,
  SESSION_STATUS.TRANSCRIBING,
  SESSION_STATUS.TRANSCRIPTION_FAILED,
]);

/**
 * Maps live record state + existing session status onto the 5-step scribe layout.
 * Index is derived only from current props — no extra UI state.
 *
 * @param {{
 *   recordState?: string;
 *   sessionStatus?: string | null;
 *   pipelineBusy?: boolean;
 * }} input
 * @returns {number}
 */
export function resolveScribeWorkflowStepIndex({
  recordState = "idle",
  sessionStatus = null,
  pipelineBusy = false,
} = {}) {
  if (
    recordState === "recording" ||
    recordState === "paused" ||
    recordState === "requesting"
  ) {
    return 0;
  }

  const status = sessionStatus ?? "";
  if (APPROVED_STATUSES.has(status)) return 4;
  if (REVIEW_STATUSES.has(status)) return 3;
  if (GENERATE_STATUSES.has(status)) return 2;
  if (pipelineBusy || recordState === "processing" || TRANSCRIBE_STATUSES.has(status)) {
    return 1;
  }
  return 0;
}
