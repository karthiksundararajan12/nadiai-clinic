/**
 * Hard-block gate for pediatric calculated doses at approval time.
 *
 * Unlike the license/registration banner (soft warning, still approvable),
 * a still-active calculated over-max dose or a blocked row the doctor has
 * not typed over cannot be approved. A doctor-typed override is allowed —
 * that is the existing CDSCO doctor-approval gate.
 */

import { PediatricDoseBlockedError } from "../errors.js";
import { PEDIATRIC_DOSE_REASON } from "./pediatric-dosage-calculator.js";

export const PEDIATRIC_DOSE_BLOCKED_CODE = "PEDIATRIC_DOSE_BLOCKED";

/**
 * @param {import("../schemas.js").PrescriptionMedication} med
 * @returns {boolean}
 */
export function isActivePediatricDoseBlock(med) {
  const meta = med?.pediatricDose;
  if (!meta || meta.overridden) return false;
  if (meta.status === "blocked" && meta.reason === PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY) {
    return true;
  }
  if (meta.status === "blocked" && !String(med.dosage ?? "").trim()) {
    return true;
  }
  if (
    (meta.status === "suggested" || meta.status === "age_estimate") &&
    Number.isFinite(meta.dailyDoseMg) &&
    Number.isFinite(meta.maxDailyDoseMg) &&
    meta.dailyDoseMg > meta.maxDailyDoseMg
  ) {
    return true;
  }
  return false;
}

/**
 * @param {import("../schemas.js").PrescriptionDraft|null|undefined} draft
 * @returns {import("../schemas.js").PrescriptionMedication[]}
 */
export function findPediatricDoseApprovalBlocks(draft) {
  return (draft?.medications ?? []).filter((med) => isActivePediatricDoseBlock(med));
}

/**
 * Throws PediatricDoseBlockedError when a calculated over-max / blocked
 * suggestion is still on the draft. Safe to call with a non-pediatric draft
 * (no pediatricDose metadata → no-op).
 *
 * @param {import("../schemas.js").PrescriptionDraft|null|undefined} draft
 */
export function assertPediatricDosageSafeForApproval(draft) {
  const blocked = findPediatricDoseApprovalBlocks(draft);
  if (blocked.length === 0) return;

  const names = blocked.map((med) => med.name || "medicine").join(", ");
  throw new PediatricDoseBlockedError(
    `Pediatric calculated dose exceeds the maximum daily limit for ${names}. Enter the dose manually — this cannot be auto-approved.`,
    {
      code: PEDIATRIC_DOSE_BLOCKED_CODE,
      medications: blocked.map((med) => ({
        name: med.name,
        reason: med.pediatricDose?.reason ?? null,
        dailyDoseMg: med.pediatricDose?.dailyDoseMg ?? null,
        maxDailyDoseMg: med.pediatricDose?.maxDailyDoseMg ?? null,
      })),
    },
  );
}
