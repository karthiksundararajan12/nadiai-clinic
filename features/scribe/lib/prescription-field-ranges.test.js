import test from "node:test";
import assert from "node:assert/strict";
import {
  doseContainsRange,
  durationContainsRange,
  extractDoseFromText,
  extractDurationFromText,
  reconcileMedicationRangesFromPlan,
} from "./prescription-field-ranges.js";
import { mapGeminiPrescriptionToDraft } from "./prescription-response-mapper.js";

test("extractDurationFromText preserves range from Rx: Antibiotics for 3-4 days", () => {
  assert.equal(extractDurationFromText("Rx: Antibiotics for 3-4 days"), "3-4 days");
});

test("extractDurationFromText preserves en-dash and spaced ranges", () => {
  assert.equal(extractDurationFromText("course for 5 – 7 days"), "5-7 days");
  assert.equal(extractDurationFromText("for 2-3 weeks"), "2-3 weeks");
});

test("extractDurationFromText keeps single durations", () => {
  assert.equal(extractDurationFromText("for 5 days"), "5 days");
  assert.equal(extractDurationFromText("for 1 day"), "1 day");
});

test("extractDoseFromText preserves dose ranges", () => {
  assert.equal(extractDoseFromText("Amoxicillin 500-1000mg BD"), "500-1000mg");
  assert.equal(extractDoseFromText("dose 250 – 500 mg"), "250-500mg");
});

test("durationContainsRange / doseContainsRange detect ranges", () => {
  assert.equal(durationContainsRange("3-4 days"), true);
  assert.equal(durationContainsRange("3 days"), false);
  assert.equal(doseContainsRange("500-1000mg"), true);
  assert.equal(doseContainsRange("500mg"), false);
});

test("reconcileMedicationRangesFromPlan restores collapsed duration from plan", () => {
  const meds = [
    {
      name: "Antibiotics",
      dosage: "Not specified",
      frequency: "OD",
      duration: "3 days",
      instructions: "",
      confidence: 0.8,
    },
  ];
  const reconciled = reconcileMedicationRangesFromPlan(
    meds,
    "Rx: Antibiotics for 3-4 days",
  );
  assert.equal(reconciled[0].duration, "3-4 days");
});

test("reconcileMedicationRangesFromPlan restores collapsed dose range", () => {
  const meds = [
    {
      name: "Amoxicillin",
      dosage: "500mg",
      frequency: "BD",
      duration: "5 days",
      instructions: "",
      confidence: 0.8,
    },
  ];
  const reconciled = reconcileMedicationRangesFromPlan(
    meds,
    "- Amoxicillin 500-1000mg BD for 5 days",
  );
  assert.equal(reconciled[0].dosage, "500-1000mg");
  assert.equal(reconciled[0].duration, "5 days");
});

test("mapGeminiPrescriptionToDraft: Plan 'Rx: Antibiotics for 3-4 days' keeps duration range", () => {
  const draft = mapGeminiPrescriptionToDraft(
    {
      drugs: [
        {
          name: "Antibiotics",
          dose: "as directed",
          frequency: "OD",
          duration: "3 days",
          instructions: "",
          confidence: 0.85,
        },
      ],
      advice: "",
      followup_days: 0,
    },
    "Acute infection",
    "Rx: Antibiotics for 3-4 days",
  );

  assert.equal(draft.medications.length, 1);
  assert.equal(draft.medications[0].duration, "3-4 days");
});

test("mapGeminiPrescriptionToDraft does not invent a range when plan has none", () => {
  const draft = mapGeminiPrescriptionToDraft(
    {
      drugs: [
        {
          name: "Crocin",
          dose: "500mg",
          frequency: "SOS",
          duration: "3 days",
          instructions: "",
          confidence: 0.9,
        },
      ],
      advice: "rest",
      followup_days: 3,
    },
    "Viral fever",
    "- Crocin 500mg SOS for 3 days",
  );
  assert.equal(draft.medications[0].duration, "3 days");
  assert.equal(draft.medications[0].dosage, "500mg");
});
