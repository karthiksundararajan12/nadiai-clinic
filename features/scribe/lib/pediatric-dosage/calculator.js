/**
 * Weight-based pediatric dose calculator.
 *
 * Pure functions — no I/O. Easy to unit test and reuse from UI or services.
 */

import { findPediatricDosageReference } from "./reference-data.js";

/**
 * @typedef {import("./reference-data.js").PediatricDosageReference} PediatricDosageReference
 *
 * @typedef {{
 *   ok: true;
 *   reference: PediatricDosageReference;
 *   weightKg: number;
 *   mgPerKg: number;
 *   calculatedMg: number;
 *   doseMl: number|null;
 *   displayDose: string;
 *   exceedsMax: false;
 * } | {
 *   ok: false;
 *   reason: "no_weight" | "no_reference" | "exceeds_max";
 *   reference?: PediatricDosageReference|null;
 *   weightKg?: number|null;
 *   calculatedMg?: number;
 *   maxSingleDoseMg?: number;
 *   displayDose?: string;
 *   exceedsMax?: boolean;
 *   warning?: string;
 * }} PediatricDoseResult
 */

/**
 * Midpoint of the min/max mg/kg range.
 * @param {PediatricDosageReference} reference
 * @returns {number}
 */
export function midpointMgPerKg(reference) {
  return (Number(reference.mgPerKgMin) + Number(reference.mgPerKgMax)) / 2;
}

/**
 * Round syrup volumes to the nearest 0.5 ml (practical oral syringe increment).
 * @param {number} ml
 * @returns {number}
 */
export function roundToNearestHalfMl(ml) {
  if (!Number.isFinite(ml) || ml <= 0) return 0;
  return Math.round(ml * 2) / 2;
}

/**
 * Round solid doses to a practical mg unit.
 * @param {number} mg
 * @returns {number}
 */
export function roundPracticalMg(mg) {
  if (!Number.isFinite(mg) || mg <= 0) return 0;
  if (mg >= 100) return Math.round(mg / 5) * 5;
  if (mg >= 10) return Math.round(mg);
  return Math.round(mg * 10) / 10;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function parseWeightKg(value) {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null;
  return n;
}

/**
 * Calculate a suggested single dose from weight + drug reference.
 *
 * Does NOT write into the prescription — callers must require an explicit
 * accept/edit action before applying `displayDose` to medication.dosage.
 *
 * @param {object} input
 * @param {string|null|undefined} input.drugName
 * @param {number|string|null|undefined} input.weightKg
 * @param {PediatricDosageReference|null} [input.reference] - optional pre-resolved row
 * @returns {PediatricDoseResult}
 */
export function calculatePediatricDose({ drugName, weightKg, reference = null }) {
  const weight = parseWeightKg(weightKg);
  if (weight == null) {
    return { ok: false, reason: "no_weight", weightKg: null, reference: null };
  }

  const ref = reference ?? findPediatricDosageReference(drugName);
  if (!ref) {
    return { ok: false, reason: "no_reference", weightKg: weight, reference: null };
  }

  const mgPerKg = midpointMgPerKg(ref);
  const rawMg = weight * mgPerKg;

  // ORS rows store ml/kg in the mg_per_kg columns.
  if (ref.formulation === "ors") {
    const doseMl = roundToNearestHalfMl(rawMg);
    if (doseMl > ref.maxSingleDoseMg) {
      return {
        ok: false,
        reason: "exceeds_max",
        reference: ref,
        weightKg: weight,
        calculatedMg: doseMl,
        maxSingleDoseMg: ref.maxSingleDoseMg,
        displayDose: `${doseMl} ml`,
        exceedsMax: true,
        warning: `Calculated ORS volume (${doseMl} ml) exceeds max single volume (${ref.maxSingleDoseMg} ml) for ${ref.drugName}. Enter dose manually.`,
      };
    }
    return {
      ok: true,
      reference: ref,
      weightKg: weight,
      mgPerKg,
      calculatedMg: doseMl,
      doseMl,
      displayDose: `${formatNumber(doseMl)} ml`,
      exceedsMax: false,
    };
  }

  const calculatedMg = roundPracticalMg(rawMg);

  if (calculatedMg > ref.maxSingleDoseMg) {
    return {
      ok: false,
      reason: "exceeds_max",
      reference: ref,
      weightKg: weight,
      calculatedMg,
      maxSingleDoseMg: ref.maxSingleDoseMg,
      displayDose: `${calculatedMg} mg`,
      exceedsMax: true,
      warning: `Calculated dose (${calculatedMg} mg) exceeds max single dose (${ref.maxSingleDoseMg} mg) for ${ref.drugName}. Enter dose manually.`,
    };
  }

  let doseMl = null;
  let displayDose = `${calculatedMg} mg`;

  if (
    ref.formulation === "syrup" &&
    Number.isFinite(ref.concentrationMgPerMl) &&
    ref.concentrationMgPerMl > 0
  ) {
    doseMl = roundToNearestHalfMl(calculatedMg / ref.concentrationMgPerMl);
    displayDose = `${formatNumber(doseMl)} ml (${calculatedMg} mg)`;
  }

  return {
    ok: true,
    reference: ref,
    weightKg: weight,
    mgPerKg,
    calculatedMg,
    doseMl,
    displayDose,
    exceedsMax: false,
  };
}

/**
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : String(n);
}
