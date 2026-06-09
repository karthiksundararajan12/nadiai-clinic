/**
 * Client-side productivity estimates from session metadata (no API changes).
 */

function formatDuration(seconds) {
  if (!seconds || seconds < 1) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m < 1) return `${s}s`;
  return s > 0 ? `${m}m ${s}s` : `${m} min`;
}

/**
 * @param {object} session
 * @param {object} note
 */
export function buildProductivityMetrics(session, note) {
  const recordingSec = session?.audio_duration_seconds ?? 0;
  const genMeta = note?.generation_metadata;
  const soapGenMs = genMeta?.latencyMs ?? null;

  const timeSavedMin = recordingSec > 0
    ? Math.max(5, Math.round((recordingSec / 60) * 4.5))
    : null;

  return {
    documentationTimeSaved: timeSavedMin ? `${timeSavedMin} Minutes` : "—",
    recordingLength: formatDuration(recordingSec),
    soapGenerationTime: soapGenMs ? formatDuration(soapGenMs / 1000) : "—",
    consultationDate: session?.created_at
      ? new Date(session.created_at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—",
  };
}
