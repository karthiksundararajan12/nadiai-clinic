/**
 * Format ISO timestamps for clinical UI (local timezone).
 */
export function formatClinicalDateTime(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Best display time for a SOAP note header.
 */
export function resolveSoapDisplayDate({ note, session } = {}) {
  return (
    note?.generated_at ??
    note?.updated_at ??
    note?.approved_at ??
    session?.updated_at ??
    session?.created_at ??
    null
  );
}
