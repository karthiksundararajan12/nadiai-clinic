import test from "node:test";
import assert from "node:assert/strict";
import {
  applyVitalsAutofill,
  extractVitals,
  extractVitalsFromUtterance,
  mergeVisitVitalsIntoObjective,
  vitalRangeFlags,
} from "./vitals-utterance.js";

const ENGLISH =
  "BP 120 by 80, pulse seventy eight, temperature 98.6 F, SpO2 ninety eight percent, weight seventy kg";
const HINGLISH =
  "BP ek sau bees by assi, nabz atthattar, bukhar 98.6 F, weight sattar kg";
const HINDI =
  "blood pressure ek sau bees over assi, nabz atthattar, wazan sattar kg";

test("English utterance extracts every spoken vital and ignores nothing extra", () => {
  assert.deepEqual(extractVitalsFromUtterance(ENGLISH), {
    bp_systolic: 120,
    bp_diastolic: 80,
    pulse: 78,
    temp: 98.6,
    temp_unit: "F",
    spo2: 98,
    weight: 70,
    height: null,
    sugar: null,
    sugar_unit: null,
    sugar_type: null,
  });
});

test("Hinglish number words extract BP, pulse, and weight", () => {
  const vitals = extractVitalsFromUtterance(HINGLISH);
  assert.equal(vitals.bp_systolic, 120);
  assert.equal(vitals.bp_diastolic, 80);
  assert.equal(vitals.pulse, 78);
  assert.equal(vitals.temp, 98.6);
  assert.equal(vitals.temp_unit, "F");
  assert.equal(vitals.weight, 70);
  assert.equal(vitals.height, null);
  assert.equal(vitals.spo2, null);
});

test("Hindi utterance extracts BP, pulse, and weight", () => {
  const vitals = extractVitalsFromUtterance(HINDI);
  assert.equal(vitals.bp_systolic, 120);
  assert.equal(vitals.bp_diastolic, 80);
  assert.equal(vitals.pulse, 78);
  assert.equal(vitals.weight, 70);
  assert.equal(vitals.temp, null);
  assert.equal(vitals.spo2, null);
  assert.equal(vitals.height, null);
});

test("spoken BP phrases without digits", () => {
  assert.deepEqual(
    extractVitalsFromUtterance("one twenty over eighty, pulse seventy eight"),
    {
      bp_systolic: 120,
      bp_diastolic: 80,
      pulse: 78,
      temp: null,
      temp_unit: null,
      spo2: null,
      weight: null,
      height: null,
      sugar: null,
      sugar_unit: null,
      sugar_type: null,
    },
  );
  assert.equal(extractVitalsFromUtterance("98.6 F").temp, 98.6);
  assert.equal(extractVitalsFromUtterance("98.6 F").temp_unit, "F");
  assert.equal(extractVitalsFromUtterance("37 C").temp, 37);
  assert.equal(extractVitalsFromUtterance("37 C").temp_unit, "C");
  assert.equal(extractVitalsFromUtterance("SpO2 ninety eight percent").spo2, 98);
  assert.equal(extractVitalsFromUtterance("weight seventy kg").weight, 70);
});

test("partial vitals keep every unmentioned field null", () => {
  const vitals = extractVitalsFromUtterance("BP 120 by 80");
  assert.equal(vitals.bp_systolic, 120);
  assert.equal(vitals.bp_diastolic, 80);
  assert.equal(vitals.pulse, null);
  assert.equal(vitals.temp, null);
  assert.equal(vitals.spo2, null);
  assert.equal(vitals.weight, null);
  assert.equal(vitals.height, null);
});

test("noisy or unclear audio and sugar do not fabricate vitals", async () => {
  const noisy = extractVitalsFromUtterance("hmm the fan is loud I can't tell");
  assert.deepEqual(noisy, {
    bp_systolic: null,
    bp_diastolic: null,
    pulse: null,
    temp: null,
    temp_unit: null,
    spo2: null,
    weight: null,
    height: null,
    sugar: null,
    sugar_unit: null,
    sugar_type: null,
  });
  const sugar = extractVitalsFromUtterance("sugar was one forty yesterday");
  assert.equal(sugar.sugar, 140);
  assert.equal(sugar.bp_systolic, null);
  assert.equal(sugar.pulse, null);
  assert.equal(sugar.weight, null);

  let called = false;
  const guarded = await extractVitals("the room is noisy", {
    async complete() {
      called = true;
      return { bp_systolic: 120, pulse: 80 };
    },
  });
  assert.equal(called, false);
  assert.equal(guarded.bp_systolic, null);
  assert.equal(guarded.pulse, null);
});

test("model fallback cannot invent a number that was not spoken", async () => {
  const vitals = await extractVitals("pulse is a bit fast today", {
    async complete() {
      return { pulse: 88, bp_systolic: 120 };
    },
  });
  assert.equal(vitals.pulse, null);
  assert.equal(vitals.bp_systolic, null);
});

test("out-of-range values still extract and raise a check flag", () => {
  const vitals = extractVitalsFromUtterance("BP 300 by 20, pulse 20, temperature 89 F, spo2 40, weight 0.2 kg");
  assert.equal(vitals.bp_systolic, 300);
  assert.equal(vitals.bp_diastolic, 20);
  assert.equal(vitals.pulse, 20);
  assert.equal(vitals.temp, 89);
  assert.equal(vitals.spo2, 40);
  assert.equal(vitals.weight, 0.2);
  assert.deepEqual(vitalRangeFlags(vitals), {
    bp_systolic: true,
    bp_diastolic: true,
    pulse: true,
    temp: true,
    spo2: true,
    weight: true,
  });
  assert.equal(vitalRangeFlags({ temp: 37, temp_unit: "C" }).temp, undefined);
  assert.equal(vitalRangeFlags({ temp: 30, temp_unit: "C" }).temp, true);
});

test("voice autofill does not overwrite a value the doctor typed unless confirmed", () => {
  const current = {
    bp_systolic: "130",
    bp_diastolic: "85",
    pulse: "",
    temp: "",
    temp_unit: null,
    spo2: "",
    weight: "",
    height: "",
  };
  const extracted = extractVitalsFromUtterance("BP 120 by 80, pulse 78");
  const held = applyVitalsAutofill({
    current,
    extracted,
    typedFields: ["bp_systolic", "bp_diastolic"],
    mode: "voice",
  });
  assert.equal(held.next.bp_systolic, "130");
  assert.equal(held.next.bp_diastolic, "85");
  assert.equal(held.next.pulse, 78);
  assert.deepEqual(held.skipped, ["bp_systolic", "bp_diastolic"]);

  const replaced = applyVitalsAutofill({
    current,
    extracted,
    typedFields: ["bp_systolic", "bp_diastolic"],
    mode: "voice",
    confirmTyped: true,
  });
  assert.equal(replaced.next.bp_systolic, 120);
  assert.equal(replaced.next.bp_diastolic, 80);
});

test("consultation transcript fills only fields that are still empty", () => {
  const extracted = extractVitalsFromUtterance("BP 120 by 80, pulse 78, weight seventy kg");
  const applied = applyVitalsAutofill({
    current: { bp_systolic: "118", bp_diastolic: "76", pulse: "", weight: "", temp: "", spo2: "", height: "" },
    extracted,
    mode: "transcript",
  });
  assert.equal(applied.next.bp_systolic, "118");
  assert.equal(applied.next.bp_diastolic, "76");
  assert.equal(applied.next.pulse, 78);
  assert.equal(applied.next.weight, 70);
});

test("English sugar phrases set the value and type", () => {
  const random = extractVitalsFromUtterance("random sugar one forty");
  assert.equal(random.sugar, 140);
  assert.equal(random.sugar_type, "random");
  assert.equal(random.sugar_unit, null);
  assert.equal(random.bp_systolic, null);

  const rbs = extractVitalsFromUtterance("RBS 126 mg/dL");
  assert.equal(rbs.sugar, 126);
  assert.equal(rbs.sugar_type, "random");
  assert.equal(rbs.sugar_unit, "mg/dL");

  const fasting = extractVitalsFromUtterance("FBS 96");
  assert.equal(fasting.sugar, 96);
  assert.equal(fasting.sugar_type, "fasting");
});

test("Hinglish sugar phrase reads ek sau chalis as 140", () => {
  const vitals = extractVitalsFromUtterance("shugar ek sau chalis");
  assert.equal(vitals.sugar, 140);
  assert.equal(vitals.sugar_type, null);
  assert.equal(vitals.sugar_unit, null);
  assert.equal(vitals.bp_systolic, null);
  assert.equal(vitals.pulse, null);
});

test("unclear sugar speech stays null and does not invent a reading", async () => {
  assert.equal(extractVitalsFromUtterance("sugar was high I think").sugar, null);
  assert.equal(extractVitalsFromUtterance("shugar check karo").sugar, null);
  assert.equal(extractVitalsFromUtterance("hmm the fan is loud").sugar, null);

  const guarded = await extractVitals("sugar was high I think", {
    async complete() {
      return { sugar: 140, sugar_type: "random" };
    },
  });
  assert.equal(guarded.sugar, null);
  assert.equal(guarded.bp_systolic, null);
});

test("sugar without a type stays unlabeled on the Objective line", () => {
  const text = mergeVisitVitalsIntoObjective("P/A: soft.", {
    sugar: 140,
    sugar_unit: "mg/dL",
    sugar_type: null,
  });
  assert.match(text, /Sugar: 140 mg\/dL/);
  assert.doesNotMatch(text, /\b(?:RBS|FBS|PP):/);
});

test("sugar outside 30-600 mg/dL is flagged and still kept", () => {
  assert.equal(vitalRangeFlags({ sugar: 140, sugar_unit: "mg/dL" }).sugar, undefined);
  assert.equal(vitalRangeFlags({ sugar: 20, sugar_unit: "mg/dL" }).sugar, true);
  assert.equal(vitalRangeFlags({ sugar: 700, sugar_unit: "mg/dL" }).sugar, true);
  assert.equal(extractVitalsFromUtterance("sugar 20").sugar, 20);
});

test("visit vitals are copied into the Objective vitals line", () => {
  const text = mergeVisitVitalsIntoObjective("P/A: soft, non-tender.", {
    bp_systolic: 120,
    bp_diastolic: 80,
    pulse: 78,
    temp: 37,
    temp_unit: "C",
    spo2: 98,
    weight: 70,
    height: 170,
    sugar: 140,
    sugar_unit: "mg/dL",
    sugar_type: "random",
  });
  assert.match(text, /BP: 120\/80 mmHg/);
  assert.match(text, /HR: 78 bpm/);
  assert.match(text, /Temp: 37 °C/);
  assert.match(text, /SpO2: 98%/);
  assert.match(text, /Weight: 70 kg/);
  assert.match(text, /Height: 170 cm/);
  assert.match(text, /RBS: 140 mg\/dL/);
  assert.match(text, /P\/A: soft, non-tender/);
});
