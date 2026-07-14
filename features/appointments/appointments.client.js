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
