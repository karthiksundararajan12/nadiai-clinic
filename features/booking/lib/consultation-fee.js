/**
 * @fileoverview Pure "how much (if anything) does this doctor charge?" rule
 * (no I/O) — the single place SLOT_SELECTION decides both *whether*
 * prepayment is required and the *real* amount to charge, replacing the
 * Session 3 stub (CONSULT_FEE_PLACEHOLDER_RUPEES, now removed).
 *
 * `doctor_profiles.consultation_fee` is doctor-entered via the dashboard
 * and is the sole source of truth for both questions:
 *   - missing (null/undefined) -> not configured yet. This is NOT the same
 *     as "free" — the caller must fail loudly (HUMAN_HANDOFF), never
 *     silently fall back to a placeholder amount, so a doctor who hasn't
 *     finished onboarding can't accidentally let patients book without
 *     paying (or with a made-up price).
 *   - exactly 0 -> the doctor has deliberately configured a free
 *     consultation -> no prepayment required.
 *   - > 0 -> prepayment required for exactly that amount.
 */

import { PAYMENT_REQUIRED_MIN_FEE } from "../constants.js";

/**
 * @typedef {Object} ConsultationFeeResolution
 * @property {boolean} configured        false if consultation_fee is null/undefined.
 * @property {number|null} feeRupees     null when !configured.
 * @property {boolean} requiresPrepayment
 */

/**
 * @param {{ consultation_fee?: number|string|null }} doctor
 * @returns {ConsultationFeeResolution}
 */
export function resolveConsultationFee(doctor) {
  const rawFee = doctor?.consultation_fee;

  if (rawFee === null || rawFee === undefined) {
    return { configured: false, feeRupees: null, requiresPrepayment: false };
  }

  const feeRupees = Number(rawFee);
  return {
    configured: true,
    feeRupees,
    requiresPrepayment: feeRupees > PAYMENT_REQUIRED_MIN_FEE,
  };
}

/**
 * Normalizes a consultation fee for patient-facing copy, in whole rupees.
 *
 * The same amount reaches callers in two shapes: `resolveConsultationFee`
 * yields the number `799`, while reading `appointments.payment_amount` back
 * out of Postgres yields the string `"799.00"` (the column is
 * `numeric(10,2)`). Both must read as "₹799", never "₹799.00".
 *
 * Non-positive and blank values return null rather than a number, because
 * every message that quotes a fee describes a booking that required
 * prepayment: `Number(null)` and `Number("")` are both 0, so a missing
 * amount would otherwise silently advertise a free consultation. Callers
 * are expected to switch to copy that omits the amount entirely — quoting
 * "₹0" or a bare "₹" to a patient is worse than saying nothing.
 *
 * @param {number|string|null|undefined} amount
 * @returns {number|null} null when there is no usable amount to quote.
 */
export function toWholeRupees(amount) {
  if (amount === null || amount === undefined || amount === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}
