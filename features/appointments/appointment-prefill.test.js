import test from "node:test";
import assert from "node:assert/strict";
import { appointmentToPatientPrefill } from "./appointment-prefill.js";

test("appointmentToPatientPrefill maps appointment fields into scribe patient shape", () => {
  const patient = appointmentToPatientPrefill({
    patient_id: "patient-1",
    patient_name: "Asha Kumar",
    contact_phone: "919876543210",
    patient_age: 34,
    patient_gender: "Female",
  });

  assert.deepEqual(patient, {
    id: "patient-1",
    name: "Asha Kumar",
    phone: "919876543210",
    age: 34,
    gender: "Female",
  });
});

test("appointmentToPatientPrefill tolerates missing optional fields", () => {
  const patient = appointmentToPatientPrefill({
    patient_name: "Walk-in",
  });

  assert.deepEqual(patient, {
    id: null,
    name: "Walk-in",
    phone: null,
    age: null,
    gender: null,
  });
});
