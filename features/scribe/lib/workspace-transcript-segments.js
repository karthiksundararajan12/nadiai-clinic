/**
 * Authoritative transcript lives on scribe_transcriptions + transcription_segments.
 * scribe_sessions.transcription is a legacy JSONB column that is often [].
 */

/**
 * @param {unknown} rows
 * @returns {Array<Record<string, unknown>>}
 */
export function normalizeTranscriptSegments(rows = []) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((segment, index) => {
      const text = String(segment?.text ?? "").trim();
      if (!text) return null;
      return {
        ...segment,
        id: segment.id ?? `segment-${index}`,
        text,
        speaker: segment.speaker ?? null,
        speaker_label: segment.speaker_label ?? segment.speaker ?? null,
        start_seconds: Number(segment.start_seconds ?? segment.start ?? 0),
        end_seconds: Number(segment.end_seconds ?? segment.end ?? 0),
      };
    })
    .filter(Boolean);
}

/**
 * Table rows first, then scribe_transcriptions.segments JSONB, then full_text.
 *
 * @param {{
 *   segments?: unknown;
 *   transcription?: { segments?: unknown; full_text?: string; text?: string } | null;
 * }} workspace
 */
export function resolveWorkspaceTranscriptSegments(workspace = {}) {
  const tableRows = normalizeTranscriptSegments(workspace.segments);
  if (tableRows.length) return tableRows;

  const jsonbRows = normalizeTranscriptSegments(workspace.transcription?.segments);
  if (jsonbRows.length) return jsonbRows;

  const fullText = String(
    workspace.transcription?.full_text ?? workspace.transcription?.text ?? "",
  ).trim();
  if (!fullText) return [];

  return [
    {
      id: "full-text",
      text: fullText,
      speaker_label: "Doctor",
      start_seconds: 0,
      end_seconds: 0,
    },
  ];
}

/**
 * A later GET /review can race refine's delete-then-insert and return [].
 * Never replace a transcript the UI already has with that empty payload.
 *
 * @param {unknown} previous
 * @param {object} payload
 */
export function mergeLoadedTranscriptSegments(previous, payload) {
  const next = resolveWorkspaceTranscriptSegments(payload);
  if (next.length) return next;
  return Array.isArray(previous) && previous.length ? previous : [];
}
