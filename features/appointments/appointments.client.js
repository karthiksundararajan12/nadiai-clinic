/**
 * @param {string} appointmentId
 */
export async function fetchAppointmentById(appointmentId) {
  const response = await fetch(
    `/api/appointments?appointmentId=${encodeURIComponent(appointmentId)}`,
    { cache: "no-store" },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load appointment");
  }
  return payload.appointment;
}

/**
 * Builds the `/appointments?highlight=…` path used to land back on the list
 * with a given row highlighted (mirrors the `?highlight=` deep link already
 * supported by the /notifications page). Returns null when there's no id to
 * highlight, so callers can fall back to a plain refresh.
 *
 * @param {string|null|undefined} appointmentId
 * @returns {string|null}
 */
export function buildHighlightRedirectPath(appointmentId) {
  if (typeof appointmentId !== "string" || appointmentId.length === 0) {
    return null;
  }
  return `/appointments?highlight=${encodeURIComponent(appointmentId)}`;
}
