import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePediatricDose,
  midpointMgPerKg,
  parseWeightKg,
  roundPracticalMg,
  roundToNearestHalfMl,
} from "./calculator.js";
import {
  PEDIATRIC_DOSAGE_REFERENCE,
  findPediatricDosageReference,
} from "./reference-data.js";

test("starter reference includes Paracetamol, Amoxicillin, Ibuprofen, ORS", () => {
  const names = PEDIATRIC_DOSAGE_REFERENCE.map((r) => r.drugName);
  assert.deepEqual(names, ["Paracetamol", "Amoxicillin", "Ibuprofen", "ORS"]);
});

test("findPediatricDosageReference matches brand aliases", () => {
  assert.equal(findPediatricDosageReference("Crocin 250mg")?.drugName, "Paracetamol");
  assert.equal(findPediatricDosageReference("Novamox")?.drugName, "Amoxicillin");
  assert.equal(findPediatricDosageReference("Brufen syrup")?.drugName, "Ibuprofen");
  assert.equal(findPediatricDosageReference("Electral ORS")?.drugName, "ORS");
  assert.equal(findPediatricDosageReference("Random drug"), null);
});

test("midpointMgPerKg uses average of min/max", () => {
  assert.equal(midpointMgPerKg({ mgPerKgMin: 10, mgPerKgMax: 15 }), 12.5);
  assert.equal(midpointMgPerKg({ mgPerKgMin: 5, mgPerKgMax: 10 }), 7.5);
});

test("roundToNearestHalfMl rounds to practical syringe increments", () => {
  assert.equal(roundToNearestHalfMl(7.2), 7);
  assert.equal(roundToNearestHalfMl(7.3), 7.5);
  assert.equal(roundToNearestHalfMl(7.75), 8);
});

test("roundPracticalMg uses clinic-friendly increments", () => {
  assert.equal(roundPracticalMg(187.5), 190);
  assert.equal(roundPracticalMg(12.4), 12);
  assert.equal(roundPracticalMg(2.34), 2.3);
});

test("parseWeightKg rejects invalid weights", () => {
  assert.equal(parseWeightKg("12.5"), 12.5);
  assert.equal(parseWeightKg(0), null);
  assert.equal(parseWeightKg(-1), null);
  assert.equal(parseWeightKg("abc"), null);
  assert.equal(parseWeightKg(null), null);
});

test("calculatePediatricDose for Paracetamol syrup converts mg to ml", () => {
  // 12 kg * 12.5 mg/kg = 150 mg → 150/50 = 3 ml
  const result = calculatePediatricDose({
    drugName: "Paracetamol",
    weightKg: 12,
  });
  assert.equal(result.ok, true);
  assert.equal(result.calculatedMg, 150);
  assert.equal(result.doseMl, 3);
  assert.equal(result.displayDose, "3 ml (150 mg)");
  assert.equal(result.exceedsMax, false);
});

test("calculatePediatricDose does not auto-apply — caller must accept displayDose", () => {
  const result = calculatePediatricDose({
    drugName: "Ibuprofen",
    weightKg: 10,
  });
  // 10 * 7.5 = 75 mg → 75/20 = 3.75 → 4 ml
  assert.equal(result.ok, true);
  assert.equal(result.calculatedMg, 75);
  assert.equal(result.doseMl, 4);
  assert.match(result.displayDose, /ml/);
});

test("calculatePediatricDose returns exceeds_max warning instead of suggestion", () => {
  // Heavy adolescent: 80 kg * 12.5 = 1000 mg on the nose is ok; 90 kg * 12.5 = 1125 > 1000
  const result = calculatePediatricDose({
    drugName: "Paracetamol",
    weightKg: 90,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "exceeds_max");
  assert.equal(result.exceedsMax, true);
  assert.match(result.warning, /exceeds max single dose/i);
});

test("calculatePediatricDose for ORS uses ml/kg and rounds to 0.5 ml", () => {
  // 10 kg * 15 ml/kg midpoint = 150 ml
  const result = calculatePediatricDose({
    drugName: "ORS",
    weightKg: 10,
  });
  assert.equal(result.ok, true);
  assert.equal(result.doseMl, 150);
  assert.equal(result.displayDose, "150 ml");
});

test("calculatePediatricDose requires weight and a known drug", () => {
  assert.equal(
    calculatePediatricDose({ drugName: "Paracetamol", weightKg: null }).reason,
    "no_weight",
  );
  assert.equal(
    calculatePediatricDose({ drugName: "Unknown", weightKg: 12 }).reason,
    "no_reference",
  );
});

test("Amoxicillin alias match calculates per-dose syrup volume", () => {
  // 15 kg * 11.5 mg/kg = 172.5 → 175 mg; 175/25 = 7 ml
  const result = calculatePediatricDose({
    drugName: "Mox 125mg",
    weightKg: 15,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reference.drugName, "Amoxicillin");
  assert.equal(result.calculatedMg, 175);
  assert.equal(result.doseMl, 7);
});
