/**
 * @fileoverview AI Scribe domain error hierarchy.
 *
 * All errors include:
 *  - `code`        machine-readable error code for the API response
 *  - `statusCode`  HTTP status code
 *  - `details`     optional structured context (never PII)
 *  - `toJSON()`    serialises safely for API responses
 */

// ─────────────────────────────────────────────────────────────
// BASE
// ─────────────────────────────────────────────────────────────

export class ScribeError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} [statusCode=500]
   * @param {unknown} [details=null]
   */
  constructor(message, code, statusCode = 500, details = null) {
    super(message);
    this.name = "ScribeError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code:  this.code,
      ...(this.details != null && { details: this.details }),
    };
  }
}

// ─────────────────────────────────────────────────────────────
// DOMAIN ERRORS
// ─────────────────────────────────────────────────────────────

export class SessionNotFoundError extends ScribeError {
  /** @param {string} sessionId */
  constructor(sessionId) {
    super(`Session ${sessionId} not found`, "SESSION_NOT_FOUND", 404);
  }
}

export class InvalidStateTransitionError extends ScribeError {
  /**
   * @param {string} fromStatus
   * @param {string} toStatus
   */
  constructor(fromStatus, toStatus) {
    super(
      `Invalid state transition: ${fromStatus} → ${toStatus}`,
      "INVALID_STATE_TRANSITION",
      400,
      { from: fromStatus, to: toStatus },
    );
  }
}

export class SessionFinalizedError extends ScribeError {
  constructor() {
    super(
      "Session is finalized and cannot be modified",
      "SESSION_FINALIZED",
      403,
    );
  }
}

export class SessionAlreadyActiveError extends ScribeError {
  /** @param {string} activeSessionId */
  constructor(activeSessionId) {
    super(
      "A recording session is already active. Stop the current session before starting a new one.",
      "SESSION_ALREADY_ACTIVE",
      409,
      { activeSessionId },
    );
  }
}

export class UnauthorizedSessionAccessError extends ScribeError {
  constructor() {
    super(
      "Not authorized to access this session",
      "UNAUTHORIZED_ACCESS",
      403,
    );
  }
}

export class SessionValidationError extends ScribeError {
  /**
   * @param {import('zod').ZodError} zodError
   */
  constructor(zodError) {
    super("Validation failed", "VALIDATION_ERROR", 400, zodError.flatten());
  }
}

export class SessionConflictError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "SESSION_CONFLICT", 409);
  }
}

export class DatabaseError extends ScribeError {
  /**
   * @param {string} operation
   * @param {unknown} cause
   */
  constructor(operation, cause) {
    super(
      `Database operation failed: ${operation}`,
      "DATABASE_ERROR",
      500,
    );
    this.cause = cause;
  }
}

export class AuditLogError extends ScribeError {
  /** @param {unknown} cause */
  constructor(cause) {
    super("Failed to write audit log", "AUDIT_LOG_ERROR", 500);
    this.cause = cause;
  }
}

export class StorageError extends ScribeError {
  /**
   * @param {string} operation
   * @param {unknown} cause
   */
  constructor(operation, cause) {
    super(`Storage operation failed: ${operation}`, "STORAGE_ERROR", 500);
    this.cause = cause;
  }
}

export class UploadValidationError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "UPLOAD_VALIDATION_ERROR", 400);
  }
}

export class UploadNotReadyError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "UPLOAD_NOT_READY", 409);
  }
}

export class UploadExpiredError extends ScribeError {
  constructor() {
    super(
      "The signed upload URL has expired. Please request a retry URL and upload this chunk again.",
      "UPLOAD_URL_EXPIRED",
      410,
    );
  }
}

export class UploadIntegrityError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "UPLOAD_INTEGRITY_ERROR", 409);
  }
}

export class TranscriptionNotReadyError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "TRANSCRIPTION_NOT_READY", 409);
  }
}

export class TranscriptionProviderError extends ScribeError {
  /**
   * @param {string} message
   * @param {unknown} [details=null]
   */
  constructor(message, details = null) {
    super(message, "TRANSCRIPTION_PROVIDER_ERROR", 502, details);
  }
}

export class TranscriptionRetryExhaustedError extends ScribeError {
  constructor() {
    super(
      "Transcription failed after all retry attempts. Please retry manually or re-upload the recording.",
      "TRANSCRIPTION_RETRY_EXHAUSTED",
      409,
    );
  }
}

export class WorkerUnauthorizedError extends ScribeError {
  constructor() {
    super("Unauthorized worker request", "WORKER_UNAUTHORIZED", 401);
  }
}

export class SOAPGenerationError extends ScribeError {
  /**
   * @param {string} message
   * @param {unknown} [details=null]
   */
  constructor(message, details = null) {
    super(message, "SOAP_GENERATION_ERROR", 502, details);
  }
}

export class SOAPValidationError extends ScribeError {
  /** @param {unknown} details */
  constructor(details) {
    super("Generated SOAP note failed schema validation", "SOAP_VALIDATION_ERROR", 422, details);
  }
}

export class SOAPNotReadyError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "SOAP_NOT_READY", 409);
  }
}

export class QuotaExceededError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "QUOTA_EXCEEDED", 429);
  }
}

export class PrescriptionNotReadyError extends ScribeError {
  /** @param {string} message */
  constructor(message) {
    super(message, "PRESCRIPTION_NOT_READY", 409);
  }
}

export class PrescriptionGenerationError extends ScribeError {
  /**
   * @param {string}  message
   * @param {unknown} [details=null]
   */
  constructor(message, details = null) {
    super(message, "PRESCRIPTION_GENERATION_ERROR", 502, details);
  }
}

export class PrescriptionReviewError extends ScribeError {
  /**
   * @param {string}  message
   * @param {unknown} [details=null]
   */
  constructor(message, details = null) {
    super(message, "PRESCRIPTION_REVIEW_ERROR", 409, details);
  }
}

export class PrescriptionValidationError extends ScribeError {
  /** @param {unknown} details */
  constructor(details) {
    super(
      "Generated prescription draft failed schema validation",
      "PRESCRIPTION_VALIDATION_ERROR",
      422,
      details,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Returns true when the thrown value is a known ScribeError.
 * Use this to distinguish domain errors from unexpected crashes.
 *
 * @param {unknown} err
 * @returns {err is ScribeError}
 */
export function isScribeError(err) {
  return err instanceof ScribeError;
}

/**
 * Converts any error into a safe JSON-serialisable shape for API responses.
 * Scrubs stack traces and unexpected error shapes.
 *
 * @param {unknown} err
 * @returns {{ error: string; code: string; details?: unknown }}
 */
export function toApiError(err) {
  if (isScribeError(err)) return err.toJSON();
  if (err instanceof Error) {
    return { error: "An unexpected error occurred", code: "INTERNAL_ERROR" };
  }
  return { error: "An unexpected error occurred", code: "INTERNAL_ERROR" };
}
