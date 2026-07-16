/** Shown in confirm() when navigating away during an active recording. */
export const RECORDING_LEAVE_MESSAGE =
  "Recording in progress — leaving now will lose your audio. Leave anyway?";

let active = false;

/** @param {boolean} value */
export function setRecordingGuardActive(value) {
  active = Boolean(value);
}

export function isRecordingGuardActive() {
  return active;
}

export function confirmRecordingLeave() {
  if (typeof window === "undefined") return true;
  return window.confirm(RECORDING_LEAVE_MESSAGE);
}

/**
 * @param {string} fromPath
 * @param {string} toPath
 */
export function shouldBlockNavigation(fromPath, toPath) {
  return active && fromPath !== toPath;
}
