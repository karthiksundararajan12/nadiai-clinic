/**
 * @fileoverview Error hierarchy for the recording feature.
 */

// ─────────────────────────────────────────────────────────────
// BASE
// ─────────────────────────────────────────────────────────────

export class RecordingError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {boolean} [recoverable=true]  True if the user can retry without refreshing.
   */
  constructor(message, code, recoverable = true) {
    super(message);
    this.name        = "RecordingError";
    this.code        = code;
    this.recoverable = recoverable;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ─────────────────────────────────────────────────────────────
// SPECIFIC ERRORS
// ─────────────────────────────────────────────────────────────

export class BrowserNotSupportedError extends RecordingError {
  constructor() {
    super(
      "Your browser does not support audio recording. Please use Chrome, Firefox, or Safari 14.1+.",
      "BROWSER_NOT_SUPPORTED",
      false,
    );
  }
}

export class PermissionDeniedError extends RecordingError {
  constructor() {
    super(
      "Microphone access was denied. Please allow microphone access in your browser settings and try again.",
      "PERMISSION_DENIED",
      false,
    );
  }
}

export class PermissionDismissedError extends RecordingError {
  constructor() {
    super(
      "Microphone permission request was dismissed. Please click the microphone icon in your browser's address bar to grant access.",
      "PERMISSION_DISMISSED",
      true,
    );
  }
}

export class DeviceNotFoundError extends RecordingError {
  constructor() {
    super(
      "No microphone was found. Please connect a microphone and try again.",
      "DEVICE_NOT_FOUND",
      true,
    );
  }
}

export class DeviceInUseError extends RecordingError {
  constructor() {
    super(
      "Your microphone is in use by another application. Please close other apps using the microphone and try again.",
      "DEVICE_IN_USE",
      true,
    );
  }
}

export class RecordingInterruptedError extends RecordingError {
  constructor() {
    super(
      "Recording was interrupted. Your audio up to this point has been saved.",
      "RECORDING_INTERRUPTED",
      true,
    );
  }
}

export class PauseNotSupportedError extends RecordingError {
  constructor() {
    super(
      "Pause is not supported on this browser. Please stop and restart the recording.",
      "PAUSE_NOT_SUPPORTED",
      true,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Converts a raw getUserMedia / MediaRecorder DOMException into a
 * typed RecordingError so the UI can show a specific message.
 *
 * @param {unknown} err
 * @returns {RecordingError}
 */
export function wrapMediaError(err) {
  if (err instanceof RecordingError) return err;

  const name    = err?.name    ?? "";
  const message = (err?.message ?? "").toLowerCase();

  if (name === "NotAllowedError"  || name === "PermissionDeniedError") {
    // iOS Safari uses "NotAllowedError" for both denied and dismissed.
    // If the user never granted before, it's dismissible; if they blocked, it's denied.
    return new PermissionDeniedError();
  }
  if (name === "NotFoundError"    || name === "DevicesNotFoundError") return new DeviceNotFoundError();
  if (name === "NotReadableError" || name === "TrackStartError")      return new DeviceInUseError();
  if (name === "AbortError")                                          return new RecordingInterruptedError();
  if (message.includes("permission") || message.includes("denied"))  return new PermissionDeniedError();

  return new RecordingError(
    err?.message ?? "An unknown recording error occurred.",
    "UNKNOWN_RECORDING_ERROR",
    true,
  );
}

/** @param {unknown} err @returns {err is RecordingError} */
export function isRecordingError(err) {
  return err instanceof RecordingError;
}
