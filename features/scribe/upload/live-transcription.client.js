/**
 * Persists a live Deepgram transcript onto an uploaded session.
 *
 * @param {string} sessionId
 * @param {object} result
 */
export async function completeLiveTranscription(sessionId, result) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}/transcription/live-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: result.text,
      language: result.language,
      model: result.model,
      durationSeconds: result.durationSeconds ?? null,
      costCents: result.costCents,
      speakerMap: result.speakerMap,
      providerResponse: result.providerResponse,
      segments: (result.segments ?? [])
        .filter((seg) => !seg.is_interim && String(seg.text ?? "").trim())
        .map((seg, index) => ({
          id: seg.id,
          index: seg.index ?? index,
          start: Number(seg.start ?? seg.start_seconds ?? 0),
          end: Number(seg.end ?? seg.end_seconds ?? 0),
          text: seg.text,
          speaker: seg.speaker,
          speaker_label: seg.speaker_label,
          confidence: seg.confidence,
          is_low_confidence: seg.is_low_confidence,
          provider_metadata: seg.provider_metadata,
        })),
    }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Live transcript save failed (${res.status})`);
  }
  return payload;
}
