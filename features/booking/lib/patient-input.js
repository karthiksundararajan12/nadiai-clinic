/**
 * @fileoverview Pure validation/parsing for patient name + age/DOB free-text
 * entry during COLLECTING_PATIENT (no I/O).
 */

import { parse, isValid, isFuture, differenceInYears } from "date-fns";

const DOB_FORMATS = ["dd-MM-yyyy", "dd/MM/yyyy", "yyyy-MM-dd", "d-M-yyyy", "d/M/yyyy"];

export const PATIENT_AGE_MIN_YEARS = 0;
export const PATIENT_AGE_MAX_YEARS = 120;
export const PATIENT_NAME_MAX_LENGTH = 120;

/**
 * @param {string|null|undefined} rawName
 * @returns {{ valid: true; value: string } | { valid: false; error: string }}
 */
export function validatePatientName(rawName) {
  const value = String(rawName ?? "").trim().replace(/\s+/g, " ");
  if (value.length === 0) {
    return { valid: false, error: "Name can't be empty — what's the patient's full name?" };
  }
  if (value.length > PATIENT_NAME_MAX_LENGTH) {
    return { valid: false, error: "That name looks too long — please enter a shorter name." };
  }
  return { valid: true, value };
}

/**
 * Accepts either a plain integer age in years, or a date of birth in one of
 * a few common formats, and returns a normalized { ageYears, dateOfBirth }.
 *
 * @param {string|null|undefined} rawInput
 * @returns {{ valid: true; ageYears: number; dateOfBirth: string|null } | { valid: false; error: string }}
 */
export function parseAgeOrDob(rawInput) {
  const value = String(rawInput ?? "").trim();
  if (value.length === 0) {
    return { valid: false, error: "Please share the patient's age in years, or their date of birth." };
  }

  if (/^\d{1,3}$/.test(value)) {
    const ageYears = Number.parseInt(value, 10);
    if (ageYears < PATIENT_AGE_MIN_YEARS || ageYears > PATIENT_AGE_MAX_YEARS) {
      return { valid: false, error: `Please enter an age between ${PATIENT_AGE_MIN_YEARS} and ${PATIENT_AGE_MAX_YEARS} years.` };
    }
    return { valid: true, ageYears, dateOfBirth: null };
  }

  for (const dateFormat of DOB_FORMATS) {
    const parsed = parse(value, dateFormat, new Date());
    if (isValid(parsed) && !isFuture(parsed)) {
      const ageYears = differenceInYears(new Date(), parsed);
      if (ageYears < PATIENT_AGE_MIN_YEARS || ageYears > PATIENT_AGE_MAX_YEARS) {
        return { valid: false, error: "That date of birth doesn't look right — please double-check and try again." };
      }
      return { valid: true, ageYears, dateOfBirth: parsed.toISOString().slice(0, 10) };
    }
  }

  return {
    valid: false,
    error: "I didn't quite get that. Please reply with an age in years (e.g. 34) or a date of birth (DD-MM-YYYY).",
  };
}
