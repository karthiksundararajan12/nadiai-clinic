/**
 * @fileoverview WhatsApp Booking Bot domain error hierarchy.
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

export class BookingError extends Error {
  /**
   * @param {string} message
   * @param {string} code
   * @param {number} [statusCode=500]
   * @param {unknown} [details=null]
   */
  constructor(message, code, statusCode = 500, details = null) {
    super(message);
    this.name = "BookingError";
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

export class WebhookSignatureError extends BookingError {
  constructor() {
    super(
      "Invalid or missing X-Hub-Signature-256 header",
      "WEBHOOK_SIGNATURE_INVALID",
      401,
    );
  }
}

export class WebhookVerificationError extends BookingError {
  constructor() {
    super(
      "Webhook verification token mismatch",
      "WEBHOOK_VERIFICATION_FAILED",
      403,
    );
  }
}

export class RazorpayWebhookSignatureError extends BookingError {
  constructor() {
    super(
      "Invalid or missing X-Razorpay-Signature header",
      "RAZORPAY_WEBHOOK_SIGNATURE_INVALID",
      401,
    );
  }
}

export class ClinicNotFoundError extends BookingError {
  /** @param {string} phoneNumberId */
  constructor(phoneNumberId) {
    super(
      `No clinic is registered for WhatsApp phone_number_id ${phoneNumberId}`,
      "CLINIC_NOT_FOUND",
      404,
      { phoneNumberId },
    );
  }
}

export class InvalidConversationTransitionError extends BookingError {
  /**
   * @param {string} fromState
   * @param {string} toState
   */
  constructor(fromState, toState) {
    super(
      `Invalid conversation state transition: ${fromState} → ${toState}`,
      "INVALID_CONVERSATION_TRANSITION",
      400,
      { from: fromState, to: toState },
    );
  }
}

export class WhatsAppSendError extends BookingError {
  /**
   * @param {string} message
   * @param {unknown} [details=null]
   */
  constructor(message, details = null) {
    super(message, "WHATSAPP_SEND_ERROR", 502, details);
  }
}

export class WhatsAppCredentialsError extends BookingError {
  /** @param {string} message */
  constructor(message) {
    super(message, "WHATSAPP_CREDENTIALS_ERROR", 500);
  }
}

export class RazorpayCredentialsError extends BookingError {
  /** @param {string} message */
  constructor(message) {
    super(message, "RAZORPAY_CREDENTIALS_ERROR", 500);
  }
}

export class RazorpaySendError extends BookingError {
  /**
   * @param {string} message
   * @param {unknown} [details=null]
   */
  constructor(message, details = null) {
    super(message, "RAZORPAY_SEND_ERROR", 502, details);
  }
}

export class MissingConsultationFeeError extends BookingError {
  /** @param {string} doctorId */
  constructor(doctorId) {
    super(
      `doctor_profiles.consultation_fee is not configured for doctor ${doctorId} — refusing to silently default a payment amount`,
      "MISSING_CONSULTATION_FEE",
      500,
      { doctorId },
    );
  }
}

export class WorkerUnauthorizedError extends BookingError {
  constructor() {
    super("Unauthorized worker request", "WORKER_UNAUTHORIZED", 401);
  }
}

export class DatabaseError extends BookingError {
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

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Returns true when the thrown value is a known BookingError.
 * Use this to distinguish domain errors from unexpected crashes.
 *
 * @param {unknown} err
 * @returns {err is BookingError}
 */
export function isBookingError(err) {
  return err instanceof BookingError;
}

/**
 * Converts any error into a safe JSON-serialisable shape for API responses.
 * Scrubs stack traces and unexpected error shapes.
 *
 * @param {unknown} err
 * @returns {{ error: string; code: string; details?: unknown }}
 */
export function toApiError(err) {
  if (isBookingError(err)) return err.toJSON();
  return { error: "An unexpected error occurred", code: "INTERNAL_ERROR" };
}
