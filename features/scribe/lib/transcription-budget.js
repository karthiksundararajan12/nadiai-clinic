/**
 * Hard latency budget for stop-recording → transcript visible.
 *
 * Deepgram batch itself is ~10–20s. Everything else (byte proxy, minute-scale
 * retries, 8s polls, sequential live-then-batch) must stay out of the path.
 */

export const TRANSCRIPTION_BUDGET_MS = 60_000;
export const BATCH_DIARIZATION_TIMEOUT_MS = 45_000;
export const DEEPGRAM_MAX_RETRIES = 1;
export const DEEPGRAM_RETRY_BACKOFF_MS = 500;
export const SESSION_STATUS_POLL_MAX_MS = 2_000;
export const SIGNED_AUDIO_URL_TTL_SECONDS = 5 * 60;

/**
 * @param {number} intervalMs
 * @returns {number}
 */
export function capStatusPollIntervalMs(intervalMs) {
  const requested = Number(intervalMs);
  if (!Number.isFinite(requested) || requested <= 0) return SESSION_STATUS_POLL_MAX_MS;
  return Math.min(requested, SESSION_STATUS_POLL_MAX_MS);
}

/**
 * @param {number} elapsedMs
 * @param {Record<string, unknown>} [meta]
 */
export function assertTranscriptionBudget(elapsedMs, meta = {}) {
  if (elapsedMs > TRANSCRIPTION_BUDGET_MS) {
    const error = new Error(
      `Transcription budget exceeded: ${elapsedMs}ms > ${TRANSCRIPTION_BUDGET_MS}ms`,
    );
    error.code = "TRANSCRIPTION_BUDGET_EXCEEDED";
    error.details = { elapsedMs, budgetMs: TRANSCRIPTION_BUDGET_MS, ...meta };
    throw error;
  }
}

/**
 * @param {number} startedAt
 * @returns {number}
 */
export function elapsedSince(startedAt) {
  return Date.now() - startedAt;
}

/**
 * Stopwatch for stop-recording → UI shown. Marks are greppable in logs.
 *
 * @param {{ now?: () => number }} [clock]
 */
export function createPipelineTimer(clock = {}) {
  const now = clock.now ?? Date.now;
  const startedAt = now();
  /** @type {Array<{ name: string; at: number; elapsedMs: number } & Record<string, unknown>>} */
  const marks = [];

  return {
    startedAt,
    /** @param {string} name @param {Record<string, unknown>} [extra] */
    mark(name, extra = {}) {
      const at = now();
      const entry = { name, at, elapsedMs: at - startedAt, ...extra };
      marks.push(entry);
      return entry;
    },
    elapsed() {
      return now() - startedAt;
    },
    getMarks() {
      return marks.slice();
    },
    assertBudget() {
      assertTranscriptionBudget(now() - startedAt, { marks: marks.slice() });
    },
  };
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isDeepgramTimeoutError(err) {
  const message = String(err instanceof Error ? err.message : err ?? "").toLowerCase();
  return (
    err?.name === "AbortError" ||
    err?.code === "DEEPGRAM_TIMEOUT" ||
    message.includes("aborted") ||
    message.includes("timeout")
  );
}

/**
 * Transient Deepgram failures worth a single short retry. Timeouts are not.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function isTransientDeepgramError(err) {
  if (isDeepgramTimeoutError(err)) return false;
  const status = Number(err?.details?.status ?? err?.status);
  if (status === 429 || status === 502 || status === 503 || status === 504) return true;
  if (status === 400 || status === 401 || status === 403 || status === 413) return false;
  const message = String(err instanceof Error ? err.message : err ?? "").toLowerCase();
  if (
    message.includes("corrupt") ||
    message.includes("unsupported data") ||
    message.includes("invalid audio")
  ) {
    return false;
  }
  return status >= 500 || status === 0 || !status;
}
