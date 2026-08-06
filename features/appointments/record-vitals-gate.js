/**
 * Visibility gate for the Appointments "Record Vitals" action.
 * Same status rule as the list-row "Start Consultation" / Cancel buttons:
 * only while the appointment is confirmed (hidden for completed/cancelled).
 */

import { APPOINTMENT_STATUS } from "../booking/constants.js";

/**
 * @param {{
 *   status?: string|null;
 *   patientId?: string|null;
 * }} appointment
 * @returns {boolean}
 */
export function shouldShowRecordVitalsButton(appointment) {
  const status = String(appointment?.status ?? "").toLowerCase();
  const patientId = appointment?.patientId ?? null;
  return status === APPOINTMENT_STATUS.CONFIRMED && Boolean(patientId);
}
