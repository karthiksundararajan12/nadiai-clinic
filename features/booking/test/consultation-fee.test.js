import test from "node:test";
import assert from "node:assert/strict";
import { resolveConsultationFee } from "../lib/consultation-fee.js";

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
