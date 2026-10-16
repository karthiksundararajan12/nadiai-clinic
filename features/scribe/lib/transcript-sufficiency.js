export const MIN_TRANSCRIPT_WORDS = 20;
export const MIN_SPEECH_SECONDS = 10;
export const INSUFFICIENT_TRANSCRIPT_CODE = "insufficient_transcript";
export const INSUFFICIENT_TRANSCRIPT_MESSAGE = "Not enough conversation captured. Record again.";

/**
 * @param {Array<{ text?: string, start?: number, end?: number, start_seconds?: number, end_seconds?: number }>} [segments]
 */
export function speechSeconds(segments = []) {
  let measured = false;
  const seconds = segments.reduce((sum, segment) => {
    const hasTiming = segment?.start_seconds != null
      || segment?.end_seconds != null
      || segment?.start != null
      || segment?.end != null;
    if (!hasTiming) return sum;
    const start = Number(segment?.start_seconds ?? segment?.start ?? 0);
    const end = Number(segment?.end_seconds ?? segment?.end ?? start);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return sum;
    measured = true;
    return sum + (end - start);
  }, 0);
  return { measured, seconds };
}

/**
 * @param {Array<{ text?: string }>} [segments]
 * @param {string} [text]
 */
export function transcriptWordCount(segments = [], text = "") {
  const source = String(text ?? "").trim()
    || segments.map((segment) => segment?.text).filter(Boolean).join(" ");
  if (!source.trim()) return 0;
  return source.trim().split(/\s+/).length;
}

/**
 * SOAP needs a real conversation, not a one-word live fragment.
 *
 * @param {{ segments?: Array<object>, text?: string }} [input]
 */
export function assessTranscriptSufficiency({ segments = [], text = "" } = {}) {
  const words = transcriptWordCount(segments, text);
  const speech = speechSeconds(segments);
  const durationOk = !speech.measured || speech.seconds >= MIN_SPEECH_SECONDS;
  const ok = words >= MIN_TRANSCRIPT_WORDS && durationOk;
  return {
    ok,
    words,
    speechSeconds: speech.seconds,
    code: ok ? null : INSUFFICIENT_TRANSCRIPT_CODE,
    message: ok ? null : INSUFFICIENT_TRANSCRIPT_MESSAGE,
  };
}
