import test from "node:test";
import assert from "node:assert/strict";
import { resolveConsultationFee, toWholeRupees } from "../lib/consultation-fee.js";

test("resolveConsultationFee: a positive fee requires prepayment for that real amount", () => {
  const result = resolveConsultationFee({ consultation_fee: 750 });
  assert.deepEqual(result, { configured: true, feeRupees: 750, requiresPrepayment: true });
});

test("resolveConsultationFee: an explicit fee of 0 is configured but does not require prepayment", () => {
  const result = resolveConsultationFee({ consultation_fee: 0 });
  assert.deepEqual(result, { configured: true, feeRupees: 0, requiresPrepayment: false });
});

test("resolveConsultationFee: null consultation_fee is not configured — fails loudly, never defaults", () => {
  const result = resolveConsultationFee({ consultation_fee: null });
  assert.equal(result.configured, false);
  assert.equal(result.feeRupees, null);
  assert.equal(result.requiresPrepayment, false);
});

test("resolveConsultationFee: undefined consultation_fee is not configured", () => {
  const result = resolveConsultationFee({ consultation_fee: undefined });
  assert.equal(result.configured, false);
});

test("resolveConsultationFee: missing doctor object entirely is treated as not configured, not a crash", () => {
  const result = resolveConsultationFee(undefined);
  assert.equal(result.configured, false);
});

test("resolveConsultationFee: a numeric-string fee (as Postgres numeric often round-trips) is coerced correctly", () => {
  const result = resolveConsultationFee({ consultation_fee: "500" });
  assert.deepEqual(result, { configured: true, feeRupees: 500, requiresPrepayment: true });
});

// ─────────────────────────────────────────────────────────────
// toWholeRupees — shared by the pay-at-clinic confirmation
// (SlotSelectionService) and the appt_booking_confirmed template
// (PaymentWebhookService). Both quote money to patients.
// ─────────────────────────────────────────────────────────────

test("toWholeRupees: a plain number passes through unchanged", () => {
  assert.equal(toWholeRupees(750), 750);
});

test("toWholeRupees: strips paise from a numeric(10,2) string as Postgres returns it", () => {
  assert.equal(toWholeRupees("799.00"), 799);
  assert.equal(toWholeRupees(799.0), 799);
});

test("toWholeRupees: rounds a fractional fee to whole rupees", () => {
  assert.equal(toWholeRupees("799.40"), 799);
  assert.equal(toWholeRupees("799.60"), 800);
});

test("toWholeRupees: null/undefined/empty return null rather than 0", () => {
  // Number(null) and Number("") are both 0 — returning that would quote a
  // free consultation on a booking that actually required prepayment.
  assert.equal(toWholeRupees(null), null);
  assert.equal(toWholeRupees(undefined), null);
  assert.equal(toWholeRupees(""), null);
});

test("toWholeRupees: non-numeric and non-positive amounts return null", () => {
  assert.equal(toWholeRupees("abc"), null);
  assert.equal(toWholeRupees(NaN), null);
  assert.equal(toWholeRupees(0), null);
  assert.equal(toWholeRupees("0.00"), null);
  assert.equal(toWholeRupees(-50), null);
});
