/**
 * Applies calculator output to an AI prescription draft.
 *
 * Suggested doses become the editable chip value (confidence stays < 1 so
 * the doctor still sees "AI suggested"). Over-max / unknown / below-min-age
 * rows get a blank dose — never a silent number the doctor cannot see was
 * calculated.
 */

import { isPediatricSpecialization } from "../../../lib/specialization-nav.js";
import { calculatePediatricDose, PEDIATRIC_DOSE_REASON } from "./pediatric-dosage-calculator.js";
import { isPediatricAge } from "./pediatric-patient-context.js";

export const AGE_BASED_DOSE_LABEL = "age-based estimate — weight recommended";
export const MANUAL_ENTRY_DOSAGE = "";

/**
 * @param {import("./pediatric-dosage-calculator.js").PediatricDoseResult} calc
 * @returns {string}
 */
function suggestedDoseLabel(calc) {
  if (calc.cappedAtMaxSingle) {
    return `Calculated · capped at max single ${calc.entry?.maxSingleDoseMg}mg`;
  }
  if (calc.entry?.mgPerKgDose != null) {
    return `Calculated · ${calc.entry.mgPerKgDose} mg/kg`;
  }
  return `Calculated · ${calc.entry?.genericName ?? "pediatric dose"}`;
}

/**
 * @param {{
 *   specialization?: string|null;
 *   ageYears?: number|null;
 *   ageMonths?: number|null;
 * }} ctx
 * @returns {boolean}
 */
export function shouldApplyPediatricDosage(ctx) {
  return isPediatricSpecialization(ctx?.specialization) && isPediatricAge(ctx?.ageYears, ctx?.ageMonths);
}

/**
 * @param {import("../schemas.js").PrescriptionMedication} med
 * @param {import("./pediatric-dosage-calculator.js").PediatricDoseResult} calc
 * @returns {import("../schemas.js").PrescriptionMedication}
 */
export function pediatricMetaFromCalc(med, calc) {
  const label = calc.status === "age_estimate"
    ? AGE_BASED_DOSE_LABEL
    : calc.status === "suggested"
      ? suggestedDoseLabel(calc)
      : calc.message;

  return {
    ...med,
    pediatricDose: {
      status: calc.status,
      source: calc.source ?? undefined,
      weightKg: calc.weightKg ?? undefined,
      ageMonths: calc.ageMonths ?? undefined,
      mgPerKg: calc.entry?.mgPerKgDose ?? undefined,
      calculatedMg: calc.doseMg ?? undefined,
      maxDailyDoseMg: calc.dailyCapMg ?? calc.entry?.maxDailyDoseMg ?? undefined,
      dailyDoseMg: calc.dailyDoseMg ?? undefined,
      label,
      reason: calc.reason ?? undefined,
      overridden: false,
    },
  };
}

/**
 * @param {import("../schemas.js").PrescriptionDraft} draft
 * @param {{
 *   specialization?: string|null;
 *   ageYears?: number|null;
 *   ageMonths?: number|null;
 *   ageIsApproximate?: boolean;
 *   weightKg?: number|null;
 * }} ctx
 * @returns {{
 *   draft: import("../schemas.js").PrescriptionDraft;
 *   events: Array<{
 *     drugName: string;
 *     reason: string;
 *     message: string;
 *     status: string;
 *     dailyDoseMg?: number|null;
 *     dailyCapMg?: number|null;
 *   }>;
 * }}
 */
export function applyPediatricDosageToDraft(draft, ctx) {
  if (!shouldApplyPediatricDosage(ctx)) {
    return { draft, events: [] };
  }

  const events = [];
  const extraWarnings = [];
  const medications = (draft.medications ?? []).map((med) => {
    const calc = calculatePediatricDose({
      drugName: med.name,
      weightKg: ctx.weightKg,
      ageMonths: ctx.ageMonths,
      ageIsApproximate: ctx.ageIsApproximate,
    });

    if (calc.status === "unknown_drug") {
      extraWarnings.push(
        `No pediatric reference dose for "${med.name}". Enter dose manually.`,
      );
      events.push({
        drugName: med.name,
        reason: calc.reason ?? PEDIATRIC_DOSE_REASON.UNKNOWN_DRUG,
        message: calc.message,
        status: calc.status,
      });
      return {
        ...med,
        dosage: MANUAL_ENTRY_DOSAGE,
        pediatricDose: undefined,
      };
    }

    if (calc.ok && calc.dosage) {
      const next = pediatricMetaFromCalc(
        {
          ...med,
          dosage: calc.dosage,
          frequency: calc.frequency || med.frequency,
        },
        calc,
      );
      if (calc.status === "age_estimate") {
        extraWarnings.push(
          `"${med.name}": ${AGE_BASED_DOSE_LABEL}.`,
        );
      }
      return next;
    }

    extraWarnings.push(`"${med.name}": ${calc.message}`);
    events.push({
      drugName: med.name,
      reason: calc.reason ?? "manual_required",
      message: calc.message,
      status: calc.status,
      dailyDoseMg: calc.dailyDoseMg,
      dailyCapMg: calc.dailyCapMg,
    });
    return pediatricMetaFromCalc(
      {
        ...med,
        dosage: MANUAL_ENTRY_DOSAGE,
      },
      calc,
    );
  });

  const warnings = [...new Set([...(draft.warnings ?? []), ...extraWarnings])];
  return { draft: { ...draft, medications, warnings }, events };
}

/**
 * Doctor edited the visible dose chip — keep the advisory metadata but mark
 * override so approval no longer treats this as a calculated value.
 *
 * @param {import("../schemas.js").PrescriptionMedication} med
 * @param {Partial<import("../schemas.js").PrescriptionMedication>} patch
 */
export function mergeMedicationWithPediatricOverride(med, patch) {
  const next = { ...med, ...patch };
  if (!med.pediatricDose) return next;
  const dosageChanged = patch.dosage !== undefined && patch.dosage !== med.dosage;
  if (!dosageChanged) return next;
  return {
    ...next,
    pediatricDose: { ...med.pediatricDose, overridden: true },
  };
}
