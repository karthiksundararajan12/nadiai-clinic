/**
 * Maps a dashboard appointment record into the patient shape used by Scribe.
 *
 * @param {import("./appointments.service.js").FormattedAppointment & {
 *   patient_age?: number|null;
 *   patient_gender?: string|null;
 * }} appointment
 */
export function appointmentToPatientPrefill(appointment) {
  return {
    id: appointment.patient_id ?? null,
    name: appointment.patient_name ?? "",
    phone: appointment.contact_phone ?? null,
    age: appointment.patient_age ?? null,
    gender: appointment.patient_gender ?? null,
  };
}
