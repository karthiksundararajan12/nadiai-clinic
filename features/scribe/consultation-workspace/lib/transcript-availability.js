import { resolveTranscriptWorkspaceAccess } from "../../lib/transcript-workspace-policy.js";
import { SESSION_STATUS } from "../../constants.js";

/** Session is still waiting on speech-to-text — do not call transcript review API yet. */
export const TRANSCRIPTION_PENDING_STATUSES = new Set([
  SESSION_STATUS.UPLOADING,
  SESSION_STATUS.UPLOADED,
  SESSION_STATUS.TRANSCRIPTION_QUEUED,
  SESSION_STATUS.TRANSCRIBING,
]);

/**
 * @param {string|undefined|null} status
 */
export function isTranscriptionPending(status) {
  return TRANSCRIPTION_PENDING_STATUSES.has(status ?? "");
}

/**
 * @param {string|undefined|null} status
 */
export function isTranscriptWorkspaceAvailable(status) {
  if (!status) return false;
  return resolveTranscriptWorkspaceAccess(status).mode !== "unavailable";
}
