/**
 * @fileoverview Pure helpers for the START-menu appointment picker
 * (Reschedule / Cancel when a contact has multiple CONFIRMED appointments).
 */

import {
  MENU_APPOINTMENT_ROW_ID_PREFIX,
  WHATSAPP_CONFIG,
} from "../constants.js";
import { formatSlotLabel } from "./slot-engine.js";

/** Meta's interactive list row title/description character caps. */
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;

/** @param {string} appointmentId */
export function menuAppointmentRowId(appointmentId) {
  return `${MENU_APPOINTMENT_ROW_ID_PREFIX}${appointmentId}`;
}

/**
 * @param {string|null|undefined} replyId
 * @returns {string|null}
 */
export function parseMenuAppointmentRowId(replyId) {
  if (!replyId || !replyId.startsWith(MENU_APPOINTMENT_ROW_ID_PREFIX)) return null;
  return replyId.slice(MENU_APPOINTMENT_ROW_ID_PREFIX.length);
}

/**
 * @param {Array<{
 *   id: string;
 *   slot_start: string;
 *   patients?: { full_name?: string }|{ full_name?: string }[]|null;
 * }>} appointments
 * @returns {Array<{ id: string; title: string; description?: string }>}
 */
export function buildMenuAppointmentSelectionRows(appointments) {
  return (appointments ?? []).slice(0, WHATSAPP_CONFIG.MAX_LIST_ROWS).map((appointment) => {
    const patient = Array.isArray(appointment.patients)
      ? appointment.patients[0]
      : appointment.patients;
    const patientName = patient?.full_name?.trim() || "Appointment";
    const slotLabel = appointment.slot_start
      ? formatSlotLabel(new Date(appointment.slot_start))
      : "";
    return {
      id: menuAppointmentRowId(appointment.id),
      title: truncate(patientName, ROW_TITLE_MAX),
      description: truncate(slotLabel, ROW_DESCRIPTION_MAX),
    };
  });
}

function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
