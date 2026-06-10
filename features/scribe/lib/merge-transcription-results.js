/**
 * Merges per-chunk transcription results into one session-level result.
 * Used when WebM chunks cannot be naively concatenated into a valid file.
 *
 * @param {import('../services/transcription-providers/transcription-provider.js').TranscriptionResult[]} results
 * @param {number[]} timeOffsetsSeconds - cumulative start offset per chunk
 */
export function mergeTranscriptionResults(results, timeOffsetsSeconds = []) {
  if (!results?.length) {
    throw new Error("mergeTranscriptionResults: no results to merge");
  }

  if (results.length === 1) {
    return { ...results[0], chunkCount: 1 };
  }

  /** @type {import('../services/transcription-providers/transcription-provider.js').NormalizedSegment[]} */
  const segments = [];
  const textParts = [];
  const lowConfidenceSegments = [];
  const confidenceValues = [];
  let totalCostCents = 0;
  let totalDuration = 0;

  results.forEach((result, chunkIndex) => {
    const offset = timeOffsetsSeconds[chunkIndex] ?? 0;
    const chunkSegments = (result.segments ?? []).map((seg, index) => ({
      ...seg,
      id: String(segments.length + index),
      index: segments.length + index,
      start: roundSeconds((seg.start ?? 0) + offset),
      end: roundSeconds((seg.end ?? 0) + offset),
      provider_metadata: {
        ...(seg.provider_metadata ?? {}),
        chunk_index: chunkIndex,
      },
    }));

    segments.push(...chunkSegments);
    if (result.text?.trim()) textParts.push(result.text.trim());
    lowConfidenceSegments.push(...(result.lowConfidenceSegments ?? []));
    confidenceValues.push(...chunkSegments.map((s) => s.confidence));
    totalCostCents += result.costCents ?? 0;
    totalDuration += result.durationSeconds ?? 0;
  });

  const averageConfidence = confidenceValues.length
    ? Number((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length).toFixed(4))
    : null;

  const seenSpeakers = [...new Set(segments.map((s) => s.speaker))];
  const speakerMap = Object.fromEntries(
    seenSpeakers.map((key) => [
      key,
      segments.find((s) => s.speaker === key)?.speaker_label ?? "Unknown",
    ]),
  );

  const first = results[0];
  return {
    text: textParts.join("\n"),
    language: first.language,
    model: first.model,
    segments,
    speakerMap,
    lowConfidenceSegments,
    averageConfidence,
    confidenceSummary: {
      average: averageConfidence,
      lowConfidenceThreshold: first.confidenceSummary?.lowConfidenceThreshold ?? 0.75,
      lowConfidenceCount: lowConfidenceSegments.length,
      segmentCount: segments.length,
      chunkCount: results.length,
    },
    providerResponse: {
      merged: true,
      chunkCount: results.length,
      chunks: results.map((r) => r.providerResponse),
    },
    durationSeconds: totalDuration || null,
    costCents: totalCostCents,
    chunkCount: results.length,
  };
}

function roundSeconds(value) {
  return Number(Number(value).toFixed(3));
}
