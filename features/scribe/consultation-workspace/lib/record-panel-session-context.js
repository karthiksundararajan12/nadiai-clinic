/** Session is finished and reopened from history or still open after approval. */
export const RECORD_PANEL_CONTEXT = Object.freeze({
  IDLE: "idle",
  IN_PROGRESS: "in-progress",
  APPROVED_REVIEW: "approved-review",
});

const APPROVED_SESSION_STATUSES = new Set([
  "SOAP_APPROVED",
  "COMPLETED",
  "READY_FOR_PRESCRIPTION",
  "GENERATING_PRESCRIPTION",
  "PRESCRIPTION_DRAFT_READY",
  "PRESCRIPTION_REVIEW_REQUIRED",
  "PRESCRIPTION_REVIEWING",
  "PRESCRIPTION_APPROVED",
]);

/**
 * @param {{
 *   hasOpenSession: boolean;
 *   viewFromHistory?: boolean;
 *   sessionComplete?: boolean;
 *   sessionStatus?: string | null;
 * }} input
 * @returns {typeof RECORD_PANEL_CONTEXT[keyof typeof RECORD_PANEL_CONTEXT]}
 */
export function resolveRecordPanelContext({
  hasOpenSession,
  viewFromHistory = false,
  sessionComplete = false,
  sessionStatus = null,
}) {
  if (!hasOpenSession) return RECORD_PANEL_CONTEXT.IDLE;
  if (
    viewFromHistory ||
    sessionComplete ||
    APPROVED_SESSION_STATUSES.has(sessionStatus ?? "")
  ) {
    return RECORD_PANEL_CONTEXT.APPROVED_REVIEW;
  }
  return RECORD_PANEL_CONTEXT.IN_PROGRESS;
}

/**
 * @param {typeof RECORD_PANEL_CONTEXT[keyof typeof RECORD_PANEL_CONTEXT]} context
 * @param {{ isProcessing?: boolean; isRequesting?: boolean; isPaused?: boolean; isRecording?: boolean }} recordState
 */
export function resolveRecordPanelCopy(context, recordState = {}) {
  const { isProcessing, isRequesting, isPaused, isRecording } = recordState;

  if (isProcessing) {
    return { title: "Processing…", hint: null };
  }
  if (isRequesting) {
    return { title: "Requesting microphone…", hint: null };
  }
  if (isPaused) {
    return { title: "Paused", hint: null };
  }
  if (isRecording) {
    return { title: "Recording", hint: null };
  }

  if (context === RECORD_PANEL_CONTEXT.APPROVED_REVIEW) {
    return {
      title: "Approved session",
      hint: "Reopened for review — start a new session to record again.",
    };
  }

  if (context === RECORD_PANEL_CONTEXT.IN_PROGRESS) {
    return {
      title: "Session in progress",
      hint: "Finish or end the open consultation to record again.",
    };
  }

  return { title: "Ready to record", hint: null };
}
