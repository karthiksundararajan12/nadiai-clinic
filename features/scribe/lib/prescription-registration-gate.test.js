import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_HREF,
  assertDoctorRegistrationForApproval,
  getDoctorRegistrationNumber,
  hasDoctorRegistrationNumber,
  MISSING_DOCTOR_REGISTRATION_CODE,
  MISSING_DOCTOR_REGISTRATION_MESSAGE,
} from "./prescription-registration-gate.js";
import {
  PRESCRIPTION_COMPUTER_GENERATED_DISCLAIMER,
  formatPrescriptionPlainText,
} from "../consultation-workspace/lib/prescription-format.js";
import { MissingDoctorRegistrationError } from "../errors.js";

test("hasDoctorRegistrationNumber requires a non-blank license_number", () => {
  assert.equal(hasDoctorRegistrationNumber(null), false);
  assert.equal(hasDoctorRegistrationNumber({}), false);
  assert.equal(hasDoctorRegistrationNumber({ license_number: null }), false);
  assert.equal(hasDoctorRegistrationNumber({ license_number: "   " }), false);
  assert.equal(hasDoctorRegistrationNumber({ license_number: "MCI-1" }), true);
});

test("getDoctorRegistrationNumber trims when present", () => {
  assert.equal(getDoctorRegistrationNumber({ license_number: "  MCI-9  " }), "MCI-9");
  assert.equal(getDoctorRegistrationNumber({ license_number: "" }), null);
});

test("assertDoctorRegistrationForApproval blocks when registration missing", () => {
  assert.throws(
    () => assertDoctorRegistrationForApproval({ full_name: "Dr. A", license_number: "" }),
    (err) =>
      err instanceof Error &&
      err.code === MISSING_DOCTOR_REGISTRATION_CODE &&
      err.message === MISSING_DOCTOR_REGISTRATION_MESSAGE &&
      err.details?.settingsHref === SETTINGS_HREF,
  );
});

test("assertDoctorRegistrationForApproval allows approval when registration present", () => {
  assert.doesNotThrow(() =>
    assertDoctorRegistrationForApproval({
      full_name: "Dr. A",
      license_number: "TNMC-123",
    }),
  );
});

test("MissingDoctorRegistrationError is a hard 422 gate with Settings details", () => {
  const err = new MissingDoctorRegistrationError();
  assert.equal(err.code, "MISSING_DOCTOR_REGISTRATION");
  assert.equal(err.statusCode, 422);
  assert.match(err.message, /Settings/);
  assert.equal(err.details.settingsHref, "/settings");
});

test("export includes registration when present and always includes disclaimer", () => {
  const withReg = formatPrescriptionPlainText({
    draft: {
      medications: [{ name: "Crocin", dosage: "500mg", frequency: "OD", duration: "3 days" }],
      advice: [],
    },
    patient: { name: "Ravi" },
    doctor: {
      full_name: "Priya",
      clinic_name: "Clinic",
      license_number: "MCI-42",
    },
  });
  assert.match(withReg, /Reg\. No\. MCI-42/);
  assert.match(withReg, new RegExp(PRESCRIPTION_COMPUTER_GENERATED_DISCLAIMER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const withoutReg = formatPrescriptionPlainText({
    draft: { medications: [], advice: [] },
    patient: { name: "Ravi" },
    doctor: { full_name: "Priya", clinic_name: "Clinic", license_number: null },
  });
  assert.doesNotMatch(withoutReg, /Reg\. No\./);
  assert.match(withoutReg, /computer-generated prescription/);
});
