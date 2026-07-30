import test from "node:test";
import assert from "node:assert/strict";
import {
  applySoapSeedsToDraftFields,
  diagnosisFromAssessment,
  seedAdviceAndInvestigationsFromPlan,
  splitSoapLines,
} from "./prescription-soap-seed.js";
import {
  buildEmptyManualDraft,
  mapGeminiPrescriptionToDraft,
} from "./prescription-response-mapper.js";

test("splitSoapLines strips bullets and blanks", () => {
  assert.deepEqual(splitSoapLines("- Rest\n* Fluids\n\n• Follow up"), [
    "Rest",
    "Fluids",
    "Follow up",
  ]);
});

test("diagnosisFromAssessment uses SOAP Assessment lines", () => {
  assert.deepEqual(diagnosisFromAssessment("Viral fever\nDehydration"), [
    "Viral fever",
    "Dehydration",
  ]);
});

test("seedAdviceAndInvestigationsFromPlan splits advice vs investigations and skips med-like lines", () => {
  const plan = [
    "- Azithral 500mg 1-0-0 for 3 days",
    "- CBC and chest X-ray",
    "- Rest and plenty of fluids",
    "- Soft diet",
  ].join("\n");

  const seeded = seedAdviceAndInvestigationsFromPlan(plan);
  assert.deepEqual(seeded.investigations, ["CBC and chest X-ray"]);
  assert.deepEqual(seeded.advice, ["Rest and plenty of fluids", "Soft diet"]);
  assert.ok(!seeded.advice.some((line) => /Azithral/i.test(line)));
});

test("applySoapSeedsToDraftFields keeps AI advice when present, else seeds from plan", () => {
  const withAi = applySoapSeedsToDraftFields({
    assessment: "Viral fever",
    plan: "- Rest\n- CBC",
    existingAdvice: ["Take rest"],
  });
  assert.deepEqual(withAi.advice, ["Take rest"]);
  assert.deepEqual(withAi.diagnosis, ["Viral fever"]);

  const withoutAi = applySoapSeedsToDraftFields({
    assessment: "Viral fever",
    plan: "- Rest\n- CBC",
    existingAdvice: [],
  });
  assert.deepEqual(withoutAi.advice, ["Rest"]);
  assert.deepEqual(withoutAi.investigations, ["CBC"]);
});

test("buildEmptyManualDraft seeds diagnosis + advice + investigations from SOAP", () => {
  const draft = buildEmptyManualDraft(
    "Acute pharyngitis",
    "- Soft diet\n- Throat swab culture",
  );
  assert.deepEqual(draft.diagnosis, ["Acute pharyngitis"]);
  assert.deepEqual(draft.advice, ["Soft diet"]);
  assert.deepEqual(draft.investigations, ["Throat swab culture"]);
  assert.deepEqual(draft.medications, []);
});

test("mapGeminiPrescriptionToDraft falls back to SOAP plan for empty AI advice", () => {
  const draft = mapGeminiPrescriptionToDraft(
    {
      drugs: [{ name: "Crocin", dose: "500mg", frequency: "1-0-1", duration: "3 days" }],
      advice: "",
      followup_days: 5,
    },
    "Viral fever",
    "- Hydration\n- CBC",
  );

  assert.deepEqual(draft.diagnosis, ["Viral fever"]);
  assert.deepEqual(draft.advice, ["Hydration"]);
  assert.deepEqual(draft.investigations, ["CBC"]);
  assert.equal(draft.medications[0].name, "Crocin");
  assert.equal(draft.medications[0].frequency, "1-0-1");
  assert.equal(draft.followUpDays, 5);
});

test("mapGeminiPrescriptionToDraft medicine fields stay plain strings (no schema change)", () => {
  const draft = mapGeminiPrescriptionToDraft(
    {
      drugs: [
        {
          name: "Azithral",
          dose: "500mg",
          frequency: "OD",
          duration: "3 days",
          instructions: "after food",
          confidence: 0.8,
        },
      ],
      advice: "rest",
      followup_days: 7,
    },
    "Tonsillitis",
  );

  const med = draft.medications[0];
  assert.equal(typeof med.name, "string");
  assert.equal(typeof med.dosage, "string");
  assert.equal(typeof med.frequency, "string");
  assert.equal(typeof med.duration, "string");
  assert.equal(med.instructions, "after food");
  assert.equal(typeof med.confidence, "number");
  assert.equal(draft.advice[0], "rest");
});
