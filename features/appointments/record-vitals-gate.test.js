import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowRecordVitalsButton } from "./record-vitals-gate.js";

test("detail view: confirmed appointment with patient shows Record Vitals", () => {
  assert.equal(
    shouldShowRecordVitalsButton({
      status: "confirmed",
      patientId: "patient-1",
    }),
    true,
  );
});

test("detail view: completed appointment does not render Record Vitals button", () => {
  assert.equal(
    shouldShowRecordVitalsButton({
      status: "completed",
      patientId: "patient-1",
    }),
    false,
  );
});

test("detail view: cancelled appointment does not render Record Vitals button", () => {
  assert.equal(
    shouldShowRecordVitalsButton({
      status: "cancelled",
      patientId: "patient-1",
    }),
    false,
  );
});

test("detail view: confirmed without patientId hides Record Vitals", () => {
  assert.equal(
    shouldShowRecordVitalsButton({ status: "confirmed", patientId: null }),
    false,
  );
});
