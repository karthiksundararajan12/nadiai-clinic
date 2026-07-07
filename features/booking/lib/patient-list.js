/**
 * @fileoverview Pure helpers for building the "who is this appointment
 * for?" WhatsApp interactive list (no I/O). Truncates to Meta's row
 * title/description limits and reserves one row for "Add new patient".
 */

import {
  PATIENT_SELECTION_ADD_NEW_ID,
  PATIENT_SELECTION_ROW_ID_PREFIX,
  COLLECTING_PATIENT_COPY,
  WHATSAPP_CONFIG,
} from "../constants.js";

/** Meta's interactive list row title/description character caps. */
const ROW_TITLE_MAX = 24;
const ROW_DESCRIPTION_MAX = 72;

/** @param {string} patientId */
export function patientOptionRowId(patientId) {
  return `${PATIENT_SELECTION_ROW_ID_PREFIX}${patientId}`;
}

/**
 * @param {string|null|undefined} replyId
 * @returns {string|null} the patient id, or null if this isn't a patient-option row id
 */
export function parsePatientOptionRowId(replyId) {
  if (!replyId || !replyId.startsWith(PATIENT_SELECTION_ROW_ID_PREFIX)) return null;
  return replyId.slice(PATIENT_SELECTION_ROW_ID_PREFIX.length);
}

/**
 * @param {{ id: string; full_name: string; age_years?: number|null; date_of_birth?: string|null }[]} patients
 * @returns {Array<{ id: string; title: string; description?: string }>}
 */
export function buildPatientSelectionRows(patients) {
  const maxExistingRows = WHATSAPP_CONFIG.MAX_LIST_ROWS - 1; // reserve one row for "Add new patient"
  const rows = patients.slice(0, maxExistingRows).map((patient) => ({
    id: patientOptionRowId(patient.id),
    title: truncate(patient.full_name, ROW_TITLE_MAX),
    description: truncate(describePatientAge(patient), ROW_DESCRIPTION_MAX),
  }));
  rows.push({ id: PATIENT_SELECTION_ADD_NEW_ID, title: COLLECTING_PATIENT_COPY.ADD_NEW_PATIENT_TITLE });
  return rows;
}

function describePatientAge(patient) {
  if (patient.age_years != null) return `${patient.age_years} yrs`;
  if (patient.date_of_birth) return `DOB ${patient.date_of_birth}`;
  return "";
}

function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
