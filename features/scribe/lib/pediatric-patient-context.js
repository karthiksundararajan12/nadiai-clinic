/**
 * Patient age / weight helpers for pediatric prescription generation.
 *
 * Approximate DOB (Jan 1 of inferred birth year) is too coarse for
 * infant/toddler dosing — callers must key off dateOfBirthIsApproximate
 * rather than treating date_of_birth as an exact calendar date.
 */

import { parseVitalsFromObjective } from "../consultation-workspace/lib/vitals-objective.js";
import { normalizeAgeMonths, normalizeWeightKg } from "./pediatric-dosage-calculator.js";

export const PEDIATRIC_AGE_YEARS_MAX = 18;
export const PEDIATRIC_AGE_MONTHS_MAX = 18 * 12;

/**
 * Calendar-component age in completed months from a date-only DOB.
 * Avoids `new Date("YYYY-MM-DD")` UTC-midnight shifts.
 *
 * @param {string|null|undefined} dateOfBirth
 * @param {Date} [now]
 * @returns {number|null}
 */
export function ageMonthsFromDateOfBirth(dateOfBirth, now = new Date()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateOfBirth ?? ""));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  let months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  if (now.getDate() < day) months -= 1;
  if (months < 0) return 0;
  return months;
}

/**
 * @param {{
 *   ageYears?: number|null;
 *   dateOfBirth?: string|null;
 *   dateOfBirthIsApproximate?: boolean;
 *   now?: Date;
 * }} input
 * @returns {{ ageMonths: number|null; ageYears: number|null; ageIsApproximate: boolean }}
 */
export function resolvePediatricAge(input) {
  const ageIsApproximate = Boolean(input.dateOfBirthIsApproximate);
  const fromDob = input.dateOfBirthIsApproximate
    ? null
    : ageMonthsFromDateOfBirth(input.dateOfBirth, input.now);
  if (fromDob != null) {
    return {
      ageMonths: fromDob,
      ageYears: Math.floor(fromDob / 12),
      ageIsApproximate: false,
    };
  }

  const ageYears = Number.isFinite(Number(input.ageYears)) ? Number(input.ageYears) : null;
  if (ageYears == null) {
    return { ageMonths: null, ageYears: null, ageIsApproximate: true };
  }
  return {
    ageMonths: normalizeAgeMonths(ageYears * 12),
    ageYears,
    ageIsApproximate: true,
  };
}

/**
 * @param {string|null|undefined} objective
 * @param {number|null|undefined} [fallbackWeightKg]
 * @returns {number|null}
 */
export function resolveWeightKgFromSources(objective, fallbackWeightKg = null) {
  const fromSoap = parseVitalsFromObjective(objective ?? "").weight;
  const soapKg = normalizeWeightKg(fromSoap);
  if (soapKg != null) return soapKg;
  return normalizeWeightKg(fallbackWeightKg);
}

/**
 * @param {number|null|undefined} ageYears
 * @param {number|null|undefined} ageMonths
 * @returns {boolean}
 */
export function isPediatricAge(ageYears, ageMonths) {
  if (ageYears != null && Number.isFinite(Number(ageYears))) {
    return Number(ageYears) < PEDIATRIC_AGE_YEARS_MAX;
  }
  if (ageMonths != null && Number.isFinite(Number(ageMonths))) {
    return Number(ageMonths) < PEDIATRIC_AGE_MONTHS_MAX;
  }
  return false;
}
