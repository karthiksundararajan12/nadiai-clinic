import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_SUGGESTED_MEDICATION_DEFAULT_CONFIDENCE,
  MANUAL_MEDICATION_CONFIDENCE,
  isAiSuggestedMedication,
  isUsableSoapAssessment,
  mapGeminiDrugToMedication,
  normalizeMedicationConfidence,
} from "./prescription-medication-suggestions.js";
import { mapGeminiPrescriptionToDraft } from "./prescription-response-mapper.js";

test("isUsableSoapAssessment rejects empty and SOAP fallback wording", () => {
  assert.equal(isUsableSoapAssessment(""), false);
  assert.equal(isUsableSoapAssessment(null), false);
  assert.equal(isUsableSoapAssessment("Assessment not documented in transcript."), false);
  assert.equal(isUsableSoapAssessment("Not documented in transcript."), false);
  assert.equal(isUsableSoapAssessment("unclear"), false);
  assert.equal(isUsableSoapAssessment("Viral fever"), true);
  assert.equal(isUsableSoapAssessment("Likely GERD; rule out gastritis"), true);
});

test("mapGeminiPrescriptionToDraft populates medicines when diagnosis/assessment is present", () => {
  const draft = mapGeminiPrescriptionToDraft(
    {
      drugs: [
        {
          name: "Azithral",
          dose: "500mg",
          frequency: "1-0-0",
          duration: "3 days",
          instructions: "after food",
          confidence: 0.9,
        },
      ],
      advice: "rest",
      followup_days: 5,
    },
    "Acute pharyngitis",
    "- Soft diet",
  );

  assert.equal(draft.medications.length, 1);
  assert.equal(draft.medications[0].name, "Azithral");
  assert.equal(draft.medications[0].dosage, "500mg");
  assert.equal(draft.medications[0].frequency, "1-0-0");
  assert.equal(draft.medications[0].duration, "3 days");
  assert.equal(draft.medications[0].confidence, 0.9);
  assert.equal(isAiSuggestedMedication(draft.medications[0]), true);
});

test("mapGeminiPrescriptionToDraft leaves Rx empty when assessment is absent or unclear", () => {
  const invented = {
    drugs: [
      {
        name: "ShouldNotAppear",
        dose: "500mg",
        frequency: "OD",
        duration: "3 days",
        instructions: "",
        confidence: 0.9,
      },
    ],
    advice: "",
    followup_days: 0,
  };

  for (const assessment of ["", "Assessment not documented in transcript.", "unclear"]) {
    const draft = mapGeminiPrescriptionToDraft(invented, assessment, "- Rest");
    assert.deepEqual(draft.medications, [], `expected empty Rx for assessment=${JSON.stringify(assessment)}`);
  }
});

test("doctor edits to a suggested row preserve fields and AI confidence (not overwritten)", () => {
  const draft = mapGeminiPrescriptionToDraft(
    {
      drugs: [
        {
          name: "Crocin",
          dose: "500mg",
          frequency: "1-0-1",
          duration: "3 days",
          instructions: "after food",
          confidence: 0.82,
        },
      ],
      advice: "rest",
      followup_days: 3,
    },
    "Viral fever",
  );

  const original = draft.medications[0];
  // Simulate panel onUpdateMedication — merge edited fields, keep confidence.
  const edited = {
    ...original,
    name: "Dolo 650",
    dosage: "650mg",
    frequency: "SOS",
  };

  assert.equal(edited.confidence, 0.82);
  assert.equal(isAiSuggestedMedication(edited), true);
  assert.equal(edited.name, "Dolo 650");
  assert.equal(edited.duration, "3 days");

  // Re-mapping with the same AI payload would rebuild suggestions, but the
  // draft panel never re-runs the mapper on edit — only local state updates.
  const remapped = mapGeminiPrescriptionToDraft(
    {
      drugs: [
        {
          name: "Crocin",
          dose: "500mg",
          frequency: "1-0-1",
          duration: "3 days",
          instructions: "after food",
          confidence: 0.82,
        },
      ],
      advice: "rest",
      followup_days: 3,
    },
    "Viral fever",
  );
  assert.notEqual(remapped.medications[0].name, edited.name);
});

test("normalizeMedicationConfidence defaults and clamps", () => {
  assert.equal(normalizeMedicationConfidence(undefined), AI_SUGGESTED_MEDICATION_DEFAULT_CONFIDENCE);
  assert.equal(normalizeMedicationConfidence(-1), 0);
  assert.equal(normalizeMedicationConfidence(2), 1);
  assert.equal(normalizeMedicationConfidence(0.4), 0.4);
});

test("manual rows use confidence 1 and are not AI-suggested", () => {
  const manual = mapGeminiDrugToMedication({
    name: "X",
    dose: "1",
    frequency: "OD",
    duration: "1 day",
    instructions: "",
    confidence: MANUAL_MEDICATION_CONFIDENCE,
  });
  // Manual add path uses confidence 1 directly; Gemini mapping at 1 is edge.
  assert.equal(isAiSuggestedMedication({ confidence: MANUAL_MEDICATION_CONFIDENCE }), false);
  assert.equal(isAiSuggestedMedication(manual), false);
  assert.equal(isAiSuggestedMedication({ confidence: 0.99 }), true);
});
