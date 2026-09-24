/**
 * Pediatric dosage calculator — advisory only.
 *
 * Input: drug name + weight_kg (preferred) or age_months fallback.
 * Output: a suggested single dose, or null + reason when the doctor must
 * type the dose manually. Never invents a number for an unknown drug.
 *
 * Hard safety: if the *uncapped* weight-based daily total would exceed
 * max_daily_dose_mg (or maxDailyMgPerKg × weight), return blocked — do
 * not silently cap into a "safe-looking" suggestion.
 */

import {
  PEDIATRIC_DOSING_REFERENCE,
  findPediatricDosingEntry,
} from "./pediatric-dosing-reference.js";

export const PEDIATRIC_DOSE_REASON = Object.freeze({
  UNKNOWN_DRUG: "unknown_drug",
  BELOW_MIN_AGE: "below_min_age",
  APPROXIMATE_AGE: "approximate_age",
  MISSING_WEIGHT_AND_AGE: "missing_weight_and_age",
  NO_AGE_BAND: "no_age_band",
  EXCEEDS_MAX_DAILY: "exceeds_max_daily",
});

/** Age (months) below which an approximate DOB is too coarse to dose by age. */
export const APPROXIMATE_DOB_UNSAFE_MONTHS = 36;

/**
 * @typedef {{
 *   ok: boolean;
 *   doseMg: number|null;
 *   dosage: string|null;
 *   frequency: string|null;
 *   source: "weight"|"age"|null;
 *   status: "suggested"|"age_estimate"|"blocked"|"manual_required"|"unknown_drug";
 *   reason: string|null;
 *   message: string;
 *   entry: import("./pediatric-dosing-reference.js").PediatricDosingEntry|null;
 *   weightKg: number|null;
 *   ageMonths: number|null;
 *   rawSingleMg: number|null;
 *   suggestedSingleMg: number|null;
 *   dailyDoseMg: number|null;
 *   dailyCapMg: number|null;
 *   cappedAtMaxSingle: boolean;
 * }} PediatricDoseResult
 */

/**
 * @param {number} mg
 * @returns {number}
 */
export function roundPediatricDoseMg(mg) {
  if (!Number.isFinite(mg) || mg <= 0) return 0;
  if (mg < 10) return Math.round(mg * 10) / 10;
  if (mg < 50) return Math.round(mg);
  if (mg < 200) return Math.round(mg / 5) * 5;
  return Math.round(mg / 10) * 10;
}

/**
 * @param {number} mg
 * @returns {string}
 */
export function formatPediatricDosage(mg) {
  const rounded = roundPediatricDoseMg(mg);
  const display = Number.isInteger(rounded) ? String(rounded) : String(rounded);
  return `${display}mg`;
}

/**
 * @param {number|null|undefined} weightKg
 * @param {import("./pediatric-dosing-reference.js").PediatricDosingEntry} entry
 * @returns {number}
 */
export function resolveDailyCapMg(weightKg, entry) {
  let cap = entry.maxDailyDoseMg;
  if (entry.maxDailyMgPerKg && Number.isFinite(weightKg) && weightKg > 0) {
    cap = Math.min(cap, entry.maxDailyMgPerKg * weightKg);
  }
  return cap;
}

/**
 * @param {{
 *   drugName: string;
 *   weightKg?: number|null;
 *   ageMonths?: number|null;
 *   ageIsApproximate?: boolean;
 *   catalog?: ReadonlyArray<import("./pediatric-dosing-reference.js").PediatricDosingEntry>;
 * }} input
 * @returns {PediatricDoseResult}
 */
export function calculatePediatricDose(input) {
  const catalog = input.catalog ?? PEDIATRIC_DOSING_REFERENCE;
  const weightKg = normalizeWeightKg(input.weightKg);
  const ageMonths = normalizeAgeMonths(input.ageMonths);
  const ageIsApproximate = Boolean(input.ageIsApproximate);
  const entry = findPediatricDosingEntry(input.drugName, catalog);

  if (!entry) {
    return result({
      status: "unknown_drug",
      reason: PEDIATRIC_DOSE_REASON.UNKNOWN_DRUG,
      message: "manual entry required",
      weightKg,
      ageMonths,
    });
  }

  if (ageMonths != null && ageMonths < entry.minAgeMonths) {
    return result({
      status: "blocked",
      reason: PEDIATRIC_DOSE_REASON.BELOW_MIN_AGE,
      message: `Below minimum age (${entry.minAgeMonths} months) for ${entry.genericName} — enter dose manually.`,
      entry,
      weightKg,
      ageMonths,
    });
  }

  if (weightKg != null) {
    return doseFromWeight(entry, weightKg, ageMonths);
  }

  if (
    ageIsApproximate &&
    ageMonths != null &&
    ageMonths < APPROXIMATE_DOB_UNSAFE_MONTHS
  ) {
    return result({
      status: "manual_required",
      reason: PEDIATRIC_DOSE_REASON.APPROXIMATE_AGE,
      message: "Approximate age is too coarse for infant/toddler dosing — enter dose manually. Weight recommended.",
      entry,
      weightKg,
      ageMonths,
    });
  }

  if (ageMonths == null) {
    return result({
      status: "manual_required",
      reason: PEDIATRIC_DOSE_REASON.MISSING_WEIGHT_AND_AGE,
      message: "manual entry required",
      entry,
      weightKg,
      ageMonths,
    });
  }

  return doseFromAge(entry, ageMonths);
}

/**
 * @param {import("./pediatric-dosing-reference.js").PediatricDosingEntry} entry
 * @param {number} weightKg
 * @param {number|null} ageMonths
 * @returns {PediatricDoseResult}
 */
function doseFromWeight(entry, weightKg, ageMonths) {
  const fromBand = matchWeightBand(entry, weightKg);
  const rawSingle = fromBand != null
    ? fromBand
    : entry.mgPerKgDose != null
      ? entry.mgPerKgDose * weightKg
      : null;

  if (rawSingle == null) {
    return doseFromAge(entry, ageMonths);
  }

  const dailyCap = resolveDailyCapMg(weightKg, entry);
  const rawDaily = rawSingle * entry.timesPerDay;
  if (rawDaily > dailyCap) {
    return result({
      status: "blocked",
      reason: PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY,
      message: `Calculated daily dose (${roundPediatricDoseMg(rawDaily)}mg) exceeds max daily ${dailyCap}mg for ${entry.genericName} — enter dose manually.`,
      entry,
      weightKg,
      ageMonths,
      rawSingleMg: rawSingle,
      dailyDoseMg: rawDaily,
      dailyCapMg: dailyCap,
    });
  }

  const suggestedSingle = Math.min(rawSingle, entry.maxSingleDoseMg);
  const dailyDoseMg = suggestedSingle * entry.timesPerDay;
  if (dailyDoseMg > dailyCap) {
    return result({
      status: "blocked",
      reason: PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY,
      message: `Calculated daily dose (${roundPediatricDoseMg(dailyDoseMg)}mg) exceeds max daily ${dailyCap}mg for ${entry.genericName} — enter dose manually.`,
      entry,
      weightKg,
      ageMonths,
      rawSingleMg: rawSingle,
      suggestedSingleMg: suggestedSingle,
      dailyDoseMg,
      dailyCapMg: dailyCap,
    });
  }

  const rounded = roundPediatricDoseMg(suggestedSingle);
  return result({
    ok: true,
    status: "suggested",
    source: "weight",
    doseMg: rounded,
    dosage: formatPediatricDosage(rounded),
    frequency: entry.frequency,
    entry,
    weightKg,
    ageMonths,
    rawSingleMg: rawSingle,
    suggestedSingleMg: suggestedSingle,
    dailyDoseMg,
    dailyCapMg: dailyCap,
    cappedAtMaxSingle: rawSingle > entry.maxSingleDoseMg,
    message: rawSingle > entry.maxSingleDoseMg
      ? `Capped at max single dose (${entry.maxSingleDoseMg}mg).`
      : `${entry.mgPerKgDose != null ? `${entry.mgPerKgDose} mg/kg` : entry.genericName} × ${weightKg} kg`,
  });
}

/**
 * @param {import("./pediatric-dosing-reference.js").PediatricDosingEntry} entry
 * @param {number|null} ageMonths
 * @returns {PediatricDoseResult}
 */
function doseFromAge(entry, ageMonths) {
  if (ageMonths == null) {
    return result({
      status: "manual_required",
      reason: PEDIATRIC_DOSE_REASON.MISSING_WEIGHT_AND_AGE,
      message: "manual entry required",
      entry,
      ageMonths,
    });
  }

  const band = matchAgeBand(entry, ageMonths);
  if (band == null) {
    return result({
      status: "manual_required",
      reason: PEDIATRIC_DOSE_REASON.NO_AGE_BAND,
      message: "manual entry required",
      entry,
      ageMonths,
    });
  }

  const dailyCap = resolveDailyCapMg(null, entry);
  const dailyDoseMg = band * entry.timesPerDay;
  if (dailyDoseMg > dailyCap || band > entry.maxSingleDoseMg) {
    return result({
      status: "blocked",
      reason: PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY,
      message: `Age-based daily dose (${roundPediatricDoseMg(dailyDoseMg)}mg) exceeds max for ${entry.genericName} — enter dose manually.`,
      entry,
      ageMonths,
      rawSingleMg: band,
      suggestedSingleMg: band,
      dailyDoseMg,
      dailyCapMg: dailyCap,
    });
  }

  const rounded = roundPediatricDoseMg(band);
  return result({
    ok: true,
    status: "age_estimate",
    source: "age",
    doseMg: rounded,
    dosage: formatPediatricDosage(rounded),
    frequency: entry.frequency,
    entry,
    ageMonths,
    rawSingleMg: band,
    suggestedSingleMg: band,
    dailyDoseMg,
    dailyCapMg: dailyCap,
    message: "age-based estimate — weight recommended",
  });
}

/**
 * @param {import("./pediatric-dosing-reference.js").PediatricDosingEntry} entry
 * @param {number} ageMonths
 * @returns {number|null}
 */
function matchAgeBand(entry, ageMonths) {
  const bands = entry.ageBands ?? [];
  for (const band of bands) {
    if (ageMonths >= band.minMonths && ageMonths <= band.maxMonths) {
      return band.doseMg;
    }
  }
  return null;
}

/**
 * @param {import("./pediatric-dosing-reference.js").PediatricDosingEntry} entry
 * @param {number} weightKg
 * @returns {number|null}
 */
function matchWeightBand(entry, weightKg) {
  const bands = entry.weightBands ?? [];
  for (const band of bands) {
    if (weightKg <= band.maxKg) return band.doseMg;
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeWeightKg(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0.5 || n > 200) return null;
  return n;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function normalizeAgeMonths(value) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 216) return null;
  return Math.floor(n);
}

/**
 * @param {Partial<PediatricDoseResult>} partial
 * @returns {PediatricDoseResult}
 */
function result(partial) {
  return {
    ok: false,
    doseMg: null,
    dosage: null,
    frequency: null,
    source: null,
    status: "manual_required",
    reason: null,
    message: "manual entry required",
    entry: null,
    weightKg: null,
    ageMonths: null,
    rawSingleMg: null,
    suggestedSingleMg: null,
    dailyDoseMg: null,
    dailyCapMg: null,
    cappedAtMaxSingle: false,
    ...partial,
  };
}
