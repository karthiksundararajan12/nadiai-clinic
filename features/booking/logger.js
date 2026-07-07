/**
 * @fileoverview Structured logger for the WhatsApp Booking Bot domain.
 *
 * Outputs newline-delimited JSON to stdout/stderr so that any log
 * aggregator (Datadog, Logtail, GCP Logging, etc.) can parse it
 * without extra configuration.
 *
 * Usage:
 *   const log = createLogger({ component: "ConversationStateService" });
 *   log.info("State transition", { from: "START", to: "COLLECTING_PATIENT" });
 */

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const LOG_LEVEL_RANK = Object.freeze({ debug: 0, info: 1, warn: 2, error: 3 });
const MIN_LEVEL_RANK = IS_PRODUCTION
  ? LOG_LEVEL_RANK.info
  : LOG_LEVEL_RANK.debug;

/**
 * @typedef {"debug"|"info"|"warn"|"error"} LogLevel
 */

/**
 * @typedef {Object} LogContext
 * @property {string}  component   - e.g. "ConversationStateRepository", "WhatsAppWebhook"
 * @property {string}  [clinicId]
 * @property {string}  [contactPhone]
 * @property {string}  [waMessageId]
 * @property {string}  [requestId]
 */

/**
 * @typedef {Object} Logger
 * @property {(message: string, meta?: Record<string, unknown>) => void} debug
 * @property {(message: string, meta?: Record<string, unknown>) => void} info
 * @property {(message: string, meta?: Record<string, unknown>) => void} warn
 * @property {(message: string, meta?: Record<string, unknown>) => void} error
 * @property {(extraContext: Partial<LogContext>) => Logger} child
 */

/**
 * Creates a structured logger bound to a fixed context.
 *
 * @param {LogContext} context
 * @returns {Logger}
 */
export function createLogger(context) {
  /**
   * @param {LogLevel} level
   * @param {string}   message
   * @param {Record<string, unknown>} [meta={}]
   */
  function emit(level, message, meta = {}) {
    if (LOG_LEVEL_RANK[level] < MIN_LEVEL_RANK) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service:   "nadi-ai-booking",
      ...context,
      message,
      ...meta,
    };

    const line = JSON.stringify(entry);
    if (level === "error" || level === "warn") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  return {
    debug: (msg, meta) => emit("debug", msg, meta),
    info:  (msg, meta) => emit("info",  msg, meta),
    warn:  (msg, meta) => emit("warn",  msg, meta),
    error: (msg, meta) => emit("error", msg, meta),

    /**
     * Returns a new logger with merged context.
     * @param {Partial<LogContext>} extraContext
     * @returns {Logger}
     */
    child(extraContext) {
      return createLogger({ ...context, ...extraContext });
    },
  };
}

/** Module-level logger — use child() to bind per-request context. */
export const bookingLogger = createLogger({ component: "Booking" });
