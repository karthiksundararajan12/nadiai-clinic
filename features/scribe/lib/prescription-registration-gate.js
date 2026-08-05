/**
 * Soft warning helpers for medical registration / license number.
 *
 * Onboarding treats license_number as optional. Approval must not hard-block
 * when it is missing — the Prescription Draft panel shows an inline nudge
 * instead, and export omits "Reg. No." until the doctor adds it in Settings.
 */

export const MISSING_DOCTOR_REGISTRATION_CODE = "MISSING_DOCTOR_REGISTRATION";

/** Soft nudge copy shown in the Prescription Draft banner (does not block Approve). */
export const MISSING_DOCTOR_REGISTRATION_MESSAGE =
  "Add your medical registration number in Settings so it appears on prescriptions. You can still approve this draft.";

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
 * Previously a hard gate; now a no-op so missing license never blocks approval.
 * Registration remains a soft UI warning only (matches optional onboarding).
 *
 * @param {Record<string, unknown>|null|undefined} _doctor
 */
export function assertDoctorRegistrationForApproval(_doctor) {
  // Soft warning only — do not throw.
}
