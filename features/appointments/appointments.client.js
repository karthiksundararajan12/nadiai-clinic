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

/**
 * Doctor-initiated cancel for a CONFIRMED appointment (refund + patient ack).
 *
 * @param {string} appointmentId
 * @returns {Promise<object>} cancelled appointment
 */
export async function cancelConfirmedAppointment(appointmentId) {
  const response = await fetch(
    `/api/appointments/${encodeURIComponent(appointmentId)}/cancel`,
    { method: "POST" },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to cancel appointment");
  }
  return payload.appointment;
}

/**
 * @param {string} appointmentId
 */
export async function fetchAppointmentDeletionImpact(appointmentId) {
  const response = await fetch(
    `/api/appointments/${encodeURIComponent(appointmentId)}/deletion-impact`,
    { cache: "no-store" },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to load deletion impact");
  }
  return payload.impact;
}

/**
 * Hard-deletes an appointment (no Razorpay refund). Refuses when paid and
 * not yet refunded — Cancel first.
 *
 * @param {string} appointmentId
 */
export async function deleteAppointment(appointmentId) {
  const response = await fetch(
    `/api/appointments/${encodeURIComponent(appointmentId)}`,
    { method: "DELETE" },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? "Failed to delete appointment");
  }
  return payload;
}
