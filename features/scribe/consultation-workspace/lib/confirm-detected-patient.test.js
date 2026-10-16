import test from "node:test";
import assert from "node:assert/strict";
import { extractPatientFromTranscript } from "./patient-extraction.js";
import {
  acceptExistingPatient,
  confirmDetectedPatient,
  createCaptureState,
  createPayload,
  dismissDetection,
  existingPatientPrompt,
  ingestExtraction,
  markManualPatient,
} from "./confirm-detected-patient.js";

function store(patients = []) {
  const created = [];
  const attached = [];
  return {
    created,
    attached,
    async findByPhone(phone) {
      return patients.filter((patient) => patient.phone === phone);
    },
    async findByNameAge() {
      return patients;
    },
    async createPatient(fields) {
      const row = { id: `new-${created.length + 1}`, ...fields };
      created.push(row);
      return row;
    },
    async attach(id) {
      attached.push(id);
    },
  };
}

test("confirm creates Ravi when the phone was not heard and nothing matches", async () => {
  const detected = extractPatientFromTranscript(
    "Doctor: Name? Patient: Ravi Kumar. Doctor: Age? Patient: 4 5 years.",
  );
  const deps = store();
  const result = await confirmDetectedPatient(detected, deps);
  assert.equal(result.action, "created");
  assert.equal(result.patient.name, "Ravi Kumar");
  assert.equal(result.patient.age, 45);
  assert.equal(result.patient.sex, null);
  assert.deepEqual(deps.attached, ["new-1"]);
  assert.equal(createPayload(detected).allowMissingPhone, true);
});

test("a matching phone asks before anyone is created", async () => {
  const detected = extractPatientFromTranscript(
    "Doctor: Name? Patient: Ravi Kumar. Doctor: Age? Patient: 45 years. My number is 9845012345",
  );
  const deps = store([{
    id: "old-1",
    full_name: "Ravi Kumar",
    phone: "9845012345",
    lastVisitLabel: "12 Oct 2026",
  }]);
  const result = await confirmDetectedPatient(detected, deps);
  assert.equal(result.action, "confirm-existing");
  assert.equal(result.reason, "phone");
  assert.equal(deps.created.length, 0);
  assert.equal(
    existingPatientPrompt(result.patient),
    "Existing patient found: Ravi Kumar, last visit 12 Oct 2026. Use this patient?",
  );
  const accepted = await acceptExistingPatient(result.patient, deps);
  assert.equal(accepted.action, "attached");
  assert.deepEqual(deps.attached, ["old-1"]);
});

test("the same name and age ask before merging when there is no phone", async () => {
  const detected = extractPatientFromTranscript(
    "Doctor: What's your name? Patient: Lakshmi. Doctor: Age? Patient: Thirty two. She has fever for 3 days.",
  );
  const deps = store([{ id: "old-2", full_name: "Lakshmi", age_years: 32, phone: "" }]);
  const result = await confirmDetectedPatient(detected, deps);
  assert.equal(result.action, "confirm-existing");
  assert.equal(result.reason, "name-age");
  assert.equal(detected.sex, "female");
  assert.equal(detected.confidence.sex, "low");
  assert.equal(deps.created.length, 0);
});

test("manual add mid-recording stops extraction and keeps the typed patient", () => {
  let state = createCaptureState();
  const heard = extractPatientFromTranscript(
    "Doctor: Name? Patient: Ravi Kumar. Doctor: Age? Patient: 4 5 years.",
  );
  state = ingestExtraction(state, heard);
  assert.equal(state.detected.name, "Ravi Kumar");

  const manual = { id: "manual-1", name: "Anita Rao", age: 29, phone: "9845011111" };
  state = markManualPatient(state, manual);
  state = ingestExtraction(state, extractPatientFromTranscript(
    "Doctor: Name? Patient: Someone Else. Doctor: Age? Patient: 60 years.",
  ));
  assert.equal(state.stopped, true);
  assert.equal(state.patient.name, "Anita Rao");
  assert.equal(state.detected, null);

  state = dismissDetection(createCaptureState());
  assert.equal(state.stopped, true);
  assert.equal(ingestExtraction(state, heard).detected, null);
});
