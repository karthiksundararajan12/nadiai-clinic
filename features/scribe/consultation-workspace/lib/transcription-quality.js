const POOR_TRANSCRIPT_STATUSES = new Set([
  "TRANSCRIPTION_FAILED",
  "FAILED",
]);

/**
 * True when the session has finished processing but the transcript is missing or unusable.
 */
export function isPoorTranscription({
  sessionStatus,
  segments = [],
  loadError,
  pipelineBusy,
  loading,
}) {
  if (pipelineBusy || loading) return false;

  if (loadError) return true;
  if (POOR_TRANSCRIPT_STATUSES.has(sessionStatus)) return true;

  const reviewable = ["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"].includes(sessionStatus);
  if (!reviewable) return false;

  if (!segments.length) return true;

  const combinedText = segments.map((s) => (s.text ?? "").trim()).join(" ");
  if (combinedText.length < 8) return true;

  const withConfidence = segments.filter((s) => typeof s.confidence === "number");
  if (withConfidence.length > 0) {
    const avg =
      withConfidence.reduce((sum, s) => sum + s.confidence, 0) / withConfidence.length;
    if (avg < 0.35) return true;
  }

  return false;
}
