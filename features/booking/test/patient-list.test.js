import test from "node:test";
import assert from "node:assert/strict";
import { PATIENT_SELECTION_ADD_NEW_ID } from "../constants.js";
import { buildPatientSelectionRows, patientOptionRowId } from "../lib/patient-list.js";

test("a patient repeated once per prior appointment appears exactly once in the picker list", () => {
  const karthik = {
    id: "patient-karthik",
    contact_phone: "910000000000",
    full_name: "Karthik",
    age_years: 41,
  };
  // Join fan-out: the same patient id comes back once per prior appointment.
  const fannedOut = [1, 2, 3].map((n) => ({ ...karthik, prior_appointment_id: `appt-${n}` }));
  const rows = buildPatientSelectionRows(fannedOut).filter((r) => r.id !== PATIENT_SELECTION_ADD_NEW_ID);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, patientOptionRowId("patient-karthik"));
  assert.equal(rows[0].title, "Karthik");
  assert.equal(rows[0].description, "41 yrs");
});
