/**
 * @fileoverview Pure helpers for the Scribe "start consultation" patient
 * picker. Eligibility is per-appointment: a patient may reappear when they
 * have a new CONFIRMED appointment even if an earlier appointment already
 * has a completed scribe session.
 */

import { APPOINTMENT_STATUS } from "../../booking/constants.js";
import { SESSION_STATUS } from "../constants.js";

/** Appointment statuses that may appear in the start-consultation picker. */
export const ELIGIBLE_CONSULTATION_APPOINTMENT_STATUSES = Object.freeze([
  APPOINTMENT_STATUS.CONFIRMED,
]);

/**
 * Filters appointments down to those eligible to start a Scribe consultation.
 *
 * Rules:
 *  - Appointment status must be CONFIRMED (or another status in
 *    `eligibleStatuses`).
 *  - Exclude appointments whose `id` already has a scribe_sessions row with
 *    status COMPLETED. This is keyed by appointment_id, never by patient_id.
 *
 * @param {Array<{ id?: string|null; patient_id?: string|null; status?: string|null }>} appointments
 * @param {Iterable<string>} completedSessionAppointmentIds
 *   Appointment ids that already have a COMPLETED scribe session.
 * @param {{ eligibleStatuses?: Iterable<string> }} [opts]
 * @returns {typeof appointments}
 */
export function filterEligibleConsultationAppointments(
  appointments,
  completedSessionAppointmentIds,
  opts = {},
) {
  const eligibleStatuses = new Set(
    opts.eligibleStatuses ?? ELIGIBLE_CONSULTATION_APPOINTMENT_STATUSES,
  );

  const completedAppointmentIds = completedSessionAppointmentIds instanceof Set
    ? completedSessionAppointmentIds
    : new Set(
      [...(completedSessionAppointmentIds ?? [])].filter(
        (id) => typeof id === "string" && id.length > 0,
      ),
    );

  return (appointments ?? []).filter((appointment) => {
    if (!appointment?.id || !appointment.patient_id) return false;
    if (!eligibleStatuses.has(appointment.status)) return false;
    if (completedAppointmentIds.has(appointment.id)) return false;
    return true;
  });
}

/**
 * Extracts appointment ids that have a COMPLETED scribe session.
 * Ignores sessions without an appointment_id and non-completed statuses.
 *
 * @param {Array<{ appointment_id?: string|null; status?: string|null }>} sessions
 * @param {string} [completedStatus=SESSION_STATUS.COMPLETED]
 * @returns {Set<string>}
 */
export function completedAppointmentIdsFromSessions(
  sessions,
  completedStatus = SESSION_STATUS.COMPLETED,
) {
  const ids = new Set();
  for (const session of sessions ?? []) {
    if (
      session?.status === completedStatus &&
      typeof session.appointment_id === "string" &&
      session.appointment_id.length > 0
    ) {
      ids.add(session.appointment_id);
    }
  }
  return ids;
}
