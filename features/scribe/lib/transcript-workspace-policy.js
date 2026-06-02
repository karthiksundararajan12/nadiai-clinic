/**
 * @fileoverview Rules for opening the transcript review workspace.
 */

import {
  SESSION_STATUS,
  TRANSCRIPT_EDITABLE_SESSION_STATUSES,
  TRANSCRIPT_READONLY_SESSION_STATUSES,
} from "../constants.js";

/**
 * @typedef {"editable" | "readonly" | "unavailable"} TranscriptWorkspaceMode
 */

/**
 * @typedef {{ mode: TranscriptWorkspaceMode; readOnly: boolean; transitionToReviewing: boolean }} TranscriptWorkspaceAccess
 */

/**
 * @param {string} sessionStatus
 * @returns {TranscriptWorkspaceAccess}
 */
export function resolveTranscriptWorkspaceAccess(sessionStatus) {
  if (sessionStatus === SESSION_STATUS.TRANSCRIBED) {
    return { mode: "editable", readOnly: false, transitionToReviewing: true };
  }
  if (TRANSCRIPT_EDITABLE_SESSION_STATUSES.includes(sessionStatus)) {
    return { mode: "editable", readOnly: false, transitionToReviewing: false };
  }
  if (TRANSCRIPT_READONLY_SESSION_STATUSES.includes(sessionStatus)) {
    return { mode: "readonly", readOnly: true, transitionToReviewing: false };
  }
  return { mode: "unavailable", readOnly: false, transitionToReviewing: false };
}
