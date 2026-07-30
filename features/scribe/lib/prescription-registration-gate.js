/**
 * Hard gate: prescriptions cannot be approved without a medical registration /
 * license number on the doctor's profile (doctor_profiles.license_number).
 */

export const MISSING_DOCTOR_REGISTRATION_CODE = "MISSING_DOCTOR_REGISTRATION";

export const MISSING_DOCTOR_REGISTRATION_MESSAGE =
  "Add your medical registration number in Settings before approving prescriptions";

export const SETTINGS_HREF = "/settings";

/**
 * @param {Record<string, unknown>|null|undefined} doctor
 * @returns {boolean}
 */
export function hasDoctorRegistrationNumber(doctor) {
  const value = doctor?.license_number;
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * @param {Record<string, unknown>|null|undefined} doctor
 * @returns {string|null} trimmed registration number, or null if missing
 */
export function getDoctorRegistrationNumber(doctor) {
  if (!hasDoctorRegistrationNumber(doctor)) return null;
  return String(doctor.license_number).trim();
}

/**
 * Throws when registration is missing. Used by both the client approve path
 * and the server approve service so the gate cannot be bypassed via API.
 *
 * @param {Record<string, unknown>|null|undefined} doctor
 */
export function assertDoctorRegistrationForApproval(doctor) {
  if (hasDoctorRegistrationNumber(doctor)) return;

  const error = new Error(MISSING_DOCTOR_REGISTRATION_MESSAGE);
  error.code = MISSING_DOCTOR_REGISTRATION_CODE;
  error.statusCode = 422;
  error.details = { settingsHref: SETTINGS_HREF };
  throw error;
}
