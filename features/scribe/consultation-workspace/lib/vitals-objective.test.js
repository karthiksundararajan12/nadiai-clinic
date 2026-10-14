import test from "node:test";
import assert from "node:assert/strict";
import {
  buildObjectiveWithVitals,
  isObjectiveNotDocumented,
  normalizeObjective,
  OBJECTIVE_NOT_DOCUMENTED,
  parseVitalsFromObjective,
  prepareSoapNotePayload,
  sanitizeObjectiveVitals,
  stripVitalsFromObjective,
} from "./vitals-objective.js";

const EMPTY = { bpSys: "", bpDia: "", hr: "", temp: "", spo2: "", weight: "" };

test("parseVitalsFromObjective returns empty when objective is not documented", () => {
  assert.deepEqual(
    parseVitalsFromObjective("Not documented in transcript."),
    EMPTY,
  );
});

test("session with no vitals mentioned → vitals fields empty, not populated", () => {
  // Regression: hallucinated Vitals: line must not fill inputs when the draft
  // correctly says nothing was documented in the transcript.
  const hallucinated = [
    "Vitals: BP: 140/90 mmHg | HR: 88 bpm | Temp: 97 °F | SpO2: 99% | Weight: 78 kg",
    "",
    "Not documented in transcript.",
  ].join("\n");

  assert.deepEqual(parseVitalsFromObjective(hallucinated), EMPTY);
  assert.equal(
    stripVitalsFromObjective(hallucinated),
    "Not documented in transcript.",
  );
  assert.equal(
    sanitizeObjectiveVitals(hallucinated),
    "Not documented in transcript.",
  );
});

test("parseVitalsFromObjective still reads real vitals when findings exist", () => {
  const text =
    "Vitals: BP: 120/80 mmHg | HR: 72 bpm | Temp: 98.6 °F | SpO2: 98% | Weight: 70 kg\n\nP/A: soft, non-tender.";
  assert.deepEqual(parseVitalsFromObjective(text), {
    bpSys: "120",
    bpDia: "80",
    hr: "72",
    temp: "98.6",
    spo2: "98",
    weight: "70",
  });
});

test("buildObjectiveWithVitals persists doctor-entered weight over not-documented fallback", () => {
  const combined = buildObjectiveWithVitals(
    { ...EMPTY, weight: "12.5" },
    "Not documented in transcript.",
  );
  assert.equal(combined, "Vitals: Weight: 12.5 kg");
  assert.equal(parseVitalsFromObjective(combined).weight, "12.5");
});

test("isObjectiveNotDocumented matches SOAP fallback wording", () => {
  assert.equal(isObjectiveNotDocumented("Not documented in transcript."), true);
  assert.equal(isObjectiveNotDocumented("Not documented in transcript"), true);
  assert.equal(isObjectiveNotDocumented(OBJECTIVE_NOT_DOCUMENTED), true);
  assert.equal(isObjectiveNotDocumented("P/A soft"), false);
});

const VITALS_TRANSCRIPT =
  "Doctor: Blood pressure is 120 over 80, pulse 88, temperature 99, oxygen saturation 98 percent. Abdomen is soft and non-tender.";

const NO_OBJECTIVE_TRANSCRIPT =
  "Patient: I have had burning in my stomach for three days. Doctor: Likely acidity. Take an antacid and come back in a week.";

test("transcript with vitals normalizes into labeled objective lines", () => {
  // Model output for VITALS_TRANSCRIPT under the previous prompt: a vitals
  // sentence with no `Vitals:` prefix and no colons after the labels.
  const before = "BP 120/80 mmHg, HR 88 bpm, Temp 99°F, SpO2 98%. P/A: soft, non-tender.";
  // The card used to keep only a `Vitals:` line that matched `BP:`. Prefixed
  // without colons, the line was stripped and the inputs stayed blank.
  const strippedBefore = "Vitals: BP 120/80 mmHg, HR 88 bpm, Temp 99°F, SpO2 98%.";
  assert.equal(stripVitalsFromObjective(strippedBefore), "");
  assert.equal(parseVitalsFromObjective(strippedBefore).bpSys, "120");

  const normalized = normalizeObjective(before);
  assert.equal(normalized.isEmpty, false);
  assert.deepEqual(normalized.vitals, {
    bpSys: "120",
    bpDia: "80",
    hr: "88",
    temp: "99",
    spo2: "98",
    weight: "",
  });
  assert.match(normalized.exam, /soft, non-tender/);
  assert.deepEqual(
    normalized.lines.map((line) => line.label),
    ["Vitals", "Exam"],
  );
  assert.match(normalized.text, /^Vitals: BP: 120\/80 mmHg/);
  assert.match(VITALS_TRANSCRIPT, /120 over 80/);
});

test("transcript with no objective findings uses the documented placeholder", () => {
  assert.match(NO_OBJECTIVE_TRANSCRIPT, /burning in my stomach/);
  for (const sample of ["", null, "Not documented in transcript.", OBJECTIVE_NOT_DOCUMENTED]) {
    const normalized = normalizeObjective(sample);
    assert.equal(normalized.isEmpty, true);
    assert.equal(normalized.text, OBJECTIVE_NOT_DOCUMENTED);
    assert.deepEqual(normalized.lines, []);
    assert.deepEqual(normalized.vitals, EMPTY);
  }
});

test("prepareSoapNotePayload maps alias keys onto a required objective string", () => {
  const prepared = prepareSoapNotePayload({
    subjective: "Epigastric burning for 3 days.",
    Objective: { vitals: "BP 130/85 mmHg, HR 90 bpm", exam: "Chest clear." },
    assessment: "Likely GERD.",
    plan: "- Antacid",
  });
  assert.equal(prepared.Objective, undefined);
  assert.match(prepared.objective, /BP: 130\/85 mmHg/);
  assert.match(prepared.objective, /Chest clear/);

  const missing = prepareSoapNotePayload({
    subjective: "Headache.",
    objective: null,
    assessment: "Tension headache.",
    plan: "- Paracetamol",
  });
  assert.equal(missing.objective, OBJECTIVE_NOT_DOCUMENTED);
});
