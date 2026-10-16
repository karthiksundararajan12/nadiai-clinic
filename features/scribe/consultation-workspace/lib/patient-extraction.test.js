import test from "node:test";
import assert from "node:assert/strict";
import {
  asDraftConsultation,
  assignmentStatus,
  collapseSpokenDigits,
  detectionCardVisible,
  extractPatientFromTranscript,
  extractionShouldRun,
  FIRST_EXTRACT_MS,
  EXTRACT_INTERVAL_MS,
  normalizeExtractedName,
  normalizeExtractedPatient,
  normalizeExtractedPhone,
  orderUnassignedFirst,
} from "./patient-extraction.js";

test("split digits and phone prefixes normalize before a patient is saved", () => {
  assert.equal(collapseSpokenDigits("age 4 5 years and BP 1 80"), "age 45 years and BP 180");
  assert.equal(normalizeExtractedPhone("9 8 4 5 0 1 2 3 4 5"), "9845012345");
  assert.equal(normalizeExtractedPhone("+91 98450 12345"), "9845012345");
  assert.equal(normalizeExtractedPhone("09845012345"), "9845012345");
  assert.equal(normalizeExtractedPhone("12345"), null);
  assert.equal(normalizeExtractedName("Ravi Kumar"), "Ravi Kumar");
  assert.equal(normalizeExtractedName("A"), null);
  assert.equal(normalizeExtractedName("Ravi 123"), null);
  assert.equal(normalizeExtractedPatient({ age: 130, age_unit: "years", phone: "12" }).age, null);
  assert.equal(normalizeExtractedPatient({ sex: "male", confidence: { sex: "high" } }, "his name is Ravi").sex, null);
});

test("Ravi Kumar aged forty five stays unnamed for sex", () => {
  const patient = extractPatientFromTranscript(
    "Doctor: Name? Patient: Ravi Kumar. Doctor: Age? Patient: 4 5 years.",
  );
  assert.equal(patient.name, "Ravi Kumar");
  assert.equal(patient.age, 45);
  assert.equal(patient.age_unit, "years");
  assert.equal(patient.sex, null);
  assert.equal(detectionCardVisible(patient), true);
});

test("Lakshmi is thirty two and she is female at low confidence", () => {
  const patient = extractPatientFromTranscript(
    "Doctor: What's your name? Patient: Lakshmi. Doctor: Age? Patient: Thirty two. She has fever for 3 days.",
  );
  assert.equal(patient.name, "Lakshmi");
  assert.equal(patient.age, 32);
  assert.equal(patient.sex, "female");
  assert.equal(patient.confidence.sex, "low");
});

test("a baby of Meena is 8 months and male, and the name needs verify", () => {
  const patient = extractPatientFromTranscript("This is baby of Meena, 8 months old, boy");
  assert.equal(patient.name, "Baby of Meena");
  assert.equal(patient.confidence.name, "low");
  assert.equal(patient.age, 8);
  assert.equal(patient.age_unit, "months");
  assert.equal(patient.sex, "male");
});

test("a spoken mobile number is ten digits", () => {
  const patient = extractPatientFromTranscript("My number is 9 8 4 5 0 1 2 3 4 5");
  assert.equal(patient.phone, "9845012345");
  assert.equal(detectionCardVisible(patient), false);
});

test("symptoms alone do not open a detection card", () => {
  const patient = extractPatientFromTranscript(
    "Doctor: You have fever and cough for three days. Take rest and drink water.",
  );
  assert.equal(patient.name, null);
  assert.equal(patient.age, null);
  assert.equal(patient.phone, null);
  assert.equal(patient.sex, null);
  assert.equal(detectionCardVisible(patient), false);
});

test("extraction waits 45 seconds, then repeats every 30, and stops once confirmed", () => {
  assert.equal(extractionShouldRun({ speechMs: FIRST_EXTRACT_MS - 1 }), false);
  assert.equal(extractionShouldRun({ speechMs: FIRST_EXTRACT_MS }), true);
  assert.equal(extractionShouldRun({ speechMs: FIRST_EXTRACT_MS + EXTRACT_INTERVAL_MS - 1, lastSpeechMs: FIRST_EXTRACT_MS }), false);
  assert.equal(extractionShouldRun({ speechMs: FIRST_EXTRACT_MS + EXTRACT_INTERVAL_MS, lastSpeechMs: FIRST_EXTRACT_MS }), true);
  assert.equal(extractionShouldRun({ speechMs: 120_000, stopped: true }), false);
});

test("a recording without a patient is a draft and unassigned sessions sort first", () => {
  assert.deepEqual(asDraftConsultation({ id: "s1", status: "CREATED" }), {
    id: "s1",
    patient_id: null,
    status: "draft",
    assignment_status: "draft",
    pipeline_status: "CREATED",
  });
  assert.equal(assignmentStatus({ patient_id: null, status: "CREATED" }), "draft");
  assert.equal(assignmentStatus({ patient_id: null, status: "TRANSCRIBED" }), "unassigned");
  assert.equal(assignmentStatus({ patient_id: "p1", status: "TRANSCRIBED" }), "attached");
  const ordered = orderUnassignedFirst([
    { id: "a", patient_id: "p1" },
    { id: "b", patient_id: null },
  ]);
  assert.deepEqual(ordered.map((row) => row.id), ["b", "a"]);
});
