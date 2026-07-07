import test from "node:test";
import assert from "node:assert/strict";
import { buildDoctorStyleContext } from "../lib/doctor-prescription-style.js";
import { mapGeminiPrescriptionToDraft } from "../lib/prescription-response-mapper.js";

test("buildDoctorStyleContext returns empty for no history", () => {
  assert.equal(buildDoctorStyleContext([]), "");
});

test("buildDoctorStyleContext summarizes prescribing patterns", () => {
  const context = buildDoctorStyleContext([
    {
      draft: {
        medications: [
          { name: "Crocin", duration: "3 days", frequency: "1-0-1" },
          { name: "Crocin", duration: "5 days", frequency: "1-0-1" },
        ],
        advice: ["Rest well", "Drink fluids"],
      },
    },
  ]);

  assert.match(context, /Crocin/);
  assert.match(context, /1-0-1/);
  assert.match(context, /Rest well/);
});

test("mapGeminiPrescriptionToDraft maps drugs to medications", () => {
  const draft = mapGeminiPrescriptionToDraft(
    {
      drugs: [{ name: "Azithral", dose: "500mg", frequency: "1-0-0", duration: "3 days", instructions: "after food" }],
      advice: "rest",
      followup_days: 7,
    },
    "Viral fever",
  );

  assert.equal(draft.medications[0].name, "Azithral");
  assert.equal(draft.medications[0].dosage, "500mg");
  assert.equal(draft.followUpDays, 7);
  assert.equal(draft.advice[0], "rest");
});
