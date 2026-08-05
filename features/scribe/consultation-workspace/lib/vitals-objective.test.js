import test from "node:test";
import assert from "node:assert/strict";
import {
  buildObjectiveWithVitals,
  isObjectiveNotDocumented,
  parseVitalsFromObjective,
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

test("buildObjectiveWithVitals does not attach vitals onto not-documented fallback", () => {
  const combined = buildObjectiveWithVitals(
    { bpSys: "140", bpDia: "90", hr: "88", temp: "97", spo2: "99", weight: "78" },
    "Not documented in transcript.",
  );
  assert.equal(combined, "Not documented in transcript.");
  assert.deepEqual(parseVitalsFromObjective(combined), EMPTY);
});

test("isObjectiveNotDocumented matches SOAP fallback wording", () => {
  assert.equal(isObjectiveNotDocumented("Not documented in transcript."), true);
  assert.equal(isObjectiveNotDocumented("Not documented in transcript"), true);
  assert.equal(isObjectiveNotDocumented("P/A soft"), false);
});
