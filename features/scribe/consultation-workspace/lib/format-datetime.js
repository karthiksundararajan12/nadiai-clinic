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
 * Stable display time for SOAP header (avoids jumping when note autosaves).
 */
export function resolveSoapDisplayDate({ note, session, isApproved } = {}) {
  if (isApproved && note?.approved_at) return note.approved_at;
  if (note?.generated_at) return note.generated_at;
  if (session?.created_at) return session.created_at;
  return null;
}

export function resolveSoapDateLabel(isApproved) {
  return isApproved ? "Approved" : "Generated";
}

/**
 * Readable session label for history cards, e.g. "11 Jun, 09:39".
 * @param {string|Date|null|undefined} dateStr
 */
export function formatSessionLabel(dateStr) {
  if (!dateStr) return "Session";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "Session";

  const day = d.getDate();
  const month = d.toLocaleString(undefined, { month: "short" });
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  return `${day} ${month}, ${hours}:${minutes}`;
}
