import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePediatricDose,
  formatPediatricDosage,
  PEDIATRIC_DOSE_REASON,
  roundPediatricDoseMg,
} from "./pediatric-dosage-calculator.js";
import {
  PEDIATRIC_DOSING_REFERENCE_COUNT,
  findPediatricDosingEntry,
} from "./pediatric-dosing-reference.js";
import {
  AGE_BASED_DOSE_LABEL,
  applyPediatricDosageToDraft,
  mergeMedicationWithPediatricOverride,
  shouldApplyPediatricDosage,
} from "./pediatric-dosage-apply.js";
import {
  assertPediatricDosageSafeForApproval,
  findPediatricDoseApprovalBlocks,
} from "./pediatric-dosage-approval.js";
import { PediatricDoseBlockedError } from "../errors.js";
import {
  ageMonthsFromDateOfBirth,
  resolvePediatricAge,
  resolveWeightKgFromSources,
} from "./pediatric-patient-context.js";

test("reference table seeds a focused first catalog (20–30 drugs)", () => {
  assert.ok(PEDIATRIC_DOSING_REFERENCE_COUNT >= 20);
  assert.ok(PEDIATRIC_DOSING_REFERENCE_COUNT <= 30);
});

test("known drug + weight → correct mg calc", () => {
  const result = calculatePediatricDose({
    drugName: "Crocin 250mg Suspension",
    weightKg: 10,
    ageMonths: 24,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "suggested");
  assert.equal(result.source, "weight");
  assert.equal(result.doseMg, 150);
  assert.equal(result.dosage, "150mg");
  assert.equal(result.frequency, "TDS");
  assert.equal(result.entry.id, "paracetamol");
});

test("ibuprofen 12 kg → 10 mg/kg = 120mg, rounded to 120", () => {
  const result = calculatePediatricDose({
    drugName: "Ibugesic",
    weightKg: 12,
    ageMonths: 36,
  });
  assert.equal(result.ok, true);
  assert.equal(result.doseMg, 120);
  assert.equal(result.dosage, "120mg");
});

test("missing weight → age fallback works and is flagged", () => {
  const result = calculatePediatricDose({
    drugName: "Calpol",
    weightKg: null,
    ageMonths: 18,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, "age_estimate");
  assert.equal(result.source, "age");
  assert.equal(result.doseMg, 150);
  assert.match(result.message, /weight recommended/i);
});

test("over-max daily dose → blocked, no suggested number", () => {
  // 90 kg × 15 mg/kg × 3 = 4050 mg/day > 4000 mg absolute max
  const result = calculatePediatricDose({
    drugName: "Paracetamol",
    weightKg: 90,
    ageMonths: 192,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.reason, PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY);
  assert.equal(result.dosage, null);
  assert.equal(result.doseMg, null);
});

test("drug not in reference table → no auto-suggestion", () => {
  const result = calculatePediatricDose({
    drugName: "Completely Unknown Elixir ZX-9",
    weightKg: 12,
    ageMonths: 36,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "unknown_drug");
  assert.equal(result.dosage, null);
  assert.equal(result.message, "manual entry required");
});

test("below min_age_months → blocked", () => {
  const result = calculatePediatricDose({
    drugName: "Ibuprofen",
    weightKg: 5,
    ageMonths: 3,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, PEDIATRIC_DOSE_REASON.BELOW_MIN_AGE);
  assert.equal(result.dosage, null);
});

test("approximate DOB + infant + no weight → manual entry, not age-dosed", () => {
  const result = calculatePediatricDose({
    drugName: "Crocin",
    weightKg: null,
    ageMonths: 8,
    ageIsApproximate: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, PEDIATRIC_DOSE_REASON.APPROXIMATE_AGE);
  assert.equal(result.dosage, null);
});

test("single-dose cap still suggests when daily stays under max", () => {
  // 70 kg × 15 = 1050 → cap 1000; daily 3000 < 4000
  const result = calculatePediatricDose({
    drugName: "Dolo",
    weightKg: 70,
    ageMonths: 180,
  });
  assert.equal(result.ok, true);
  assert.equal(result.dosage, "1000mg");
  assert.equal(result.cappedAtMaxSingle, true);
});

test("findPediatricDosingEntry matches brand dropdown names", () => {
  assert.equal(findPediatricDosingEntry("Azithral 200mg Dry Syrup")?.id, "azithromycin");
  assert.equal(findPediatricDosingEntry("Novamox 250 DT")?.id, "amoxicillin");
  assert.equal(findPediatricDosingEntry("random herb tonic"), null);
});

test("roundPediatricDoseMg uses readable increments", () => {
  assert.equal(roundPediatricDoseMg(2.34), 2.3);
  assert.equal(roundPediatricDoseMg(12.4), 12);
  assert.equal(roundPediatricDoseMg(73), 75);
  assert.equal(roundPediatricDoseMg(246), 250);
  assert.equal(formatPediatricDosage(150), "150mg");
});

test("applyPediatricDosageToDraft only runs for pediatric clinic + age < 18", () => {
  const draft = {
    diagnosis: ["Viral fever"],
    medications: [
      {
        name: "Crocin",
        dosage: "500mg",
        frequency: "1-0-1",
        duration: "3 days",
        instructions: "",
        confidence: 0.85,
      },
    ],
    investigations: [],
    advice: [],
    followUpInstructions: "",
    warnings: [],
  };

  assert.equal(shouldApplyPediatricDosage({ specialization: "GP", ageYears: 4 }), false);
  assert.equal(shouldApplyPediatricDosage({ specialization: "Pediatrician", ageYears: 40 }), false);
  assert.equal(shouldApplyPediatricDosage({ specialization: "Paediatrician", ageYears: 4 }), true);

  const adultClinic = applyPediatricDosageToDraft(draft, {
    specialization: "General Physician",
    ageYears: 4,
    ageMonths: 48,
    weightKg: 16,
  });
  assert.equal(adultClinic.draft.medications[0].dosage, "500mg");

  const pediatric = applyPediatricDosageToDraft(draft, {
    specialization: "Pediatrician",
    ageYears: 4,
    ageMonths: 48,
    weightKg: 16,
  });
  assert.equal(pediatric.draft.medications[0].dosage, "240mg");
  assert.equal(pediatric.draft.medications[0].pediatricDose.status, "suggested");
  assert.equal(pediatric.draft.medications[0].confidence, 0.85);
});

test("apply: missing weight uses age fallback and flags the chip", () => {
  const draft = {
    diagnosis: ["URI"],
    medications: [
      {
        name: "Crocin",
        dosage: "500mg",
        frequency: "TDS",
        duration: "3 days",
        instructions: "",
        confidence: 0.8,
      },
    ],
    investigations: [],
    advice: [],
    followUpInstructions: "",
    warnings: [],
  };
  const { draft: next } = applyPediatricDosageToDraft(draft, {
    specialization: "Pediatrician",
    ageYears: 3,
    ageMonths: 40,
    weightKg: null,
  });
  assert.equal(next.medications[0].pediatricDose.status, "age_estimate");
  assert.equal(next.medications[0].pediatricDose.label, AGE_BASED_DOSE_LABEL);
  assert.match(next.warnings.join(" "), /weight recommended/i);
});

test("apply: unknown drug blanks the chip", () => {
  const draft = {
    diagnosis: ["URI"],
    medications: [
      {
        name: "Mystery Drops",
        dosage: "5ml",
        frequency: "OD",
        duration: "3 days",
        instructions: "",
        confidence: 0.7,
      },
    ],
    investigations: [],
    advice: [],
    followUpInstructions: "",
    warnings: [],
  };
  const { draft: next } = applyPediatricDosageToDraft(draft, {
    specialization: "Pediatrician",
    ageYears: 5,
    ageMonths: 60,
    weightKg: 18,
  });
  assert.equal(next.medications[0].dosage, "");
  assert.equal(next.medications[0].pediatricDose, undefined);
});

test("apply: over-max blanks the chip and emits a blocked event", () => {
  const draft = {
    diagnosis: ["Fever"],
    medications: [
      {
        name: "Paracetamol",
        dosage: "1g",
        frequency: "TDS",
        duration: "3 days",
        instructions: "",
        confidence: 0.8,
      },
    ],
    investigations: [],
    advice: [],
    followUpInstructions: "",
    warnings: [],
  };
  const { draft: next, events } = applyPediatricDosageToDraft(draft, {
    specialization: "Pediatrician",
    ageYears: 16,
    ageMonths: 192,
    weightKg: 90,
  });
  assert.equal(next.medications[0].dosage, "");
  assert.equal(next.medications[0].pediatricDose.status, "blocked");
  assert.equal(events[0].reason, PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY);
});

test("hard-block approval: calculated over-max cannot be approved until doctor types a dose", () => {
  const blockedDraft = {
    medications: [
      {
        name: "Paracetamol",
        dosage: "",
        frequency: "TDS",
        duration: "3 days",
        instructions: "",
        confidence: 0.8,
        pediatricDose: {
          status: "blocked",
          reason: PEDIATRIC_DOSE_REASON.EXCEEDS_MAX_DAILY,
          label: "exceeds max",
          dailyDoseMg: 4050,
          maxDailyDoseMg: 4000,
          overridden: false,
        },
      },
    ],
  };
  assert.equal(findPediatricDoseApprovalBlocks(blockedDraft).length, 1);
  assert.throws(
    () => assertPediatricDosageSafeForApproval(blockedDraft),
    PediatricDoseBlockedError,
  );

  const overridden = {
    medications: [
      mergeMedicationWithPediatricOverride(blockedDraft.medications[0], { dosage: "500mg" }),
    ],
  };
  assert.equal(overridden.medications[0].pediatricDose.overridden, true);
  assert.doesNotThrow(() => assertPediatricDosageSafeForApproval(overridden));
});

test("ageMonthsFromDateOfBirth uses calendar parts (no UTC shift)", () => {
  const months = ageMonthsFromDateOfBirth("2024-03-15", new Date(2026, 2, 15));
  assert.equal(months, 24);
  const beforeBirthday = ageMonthsFromDateOfBirth("2024-03-15", new Date(2026, 2, 14));
  assert.equal(beforeBirthday, 23);
});

test("approximate DOB is not treated as exact months", () => {
  const age = resolvePediatricAge({
    ageYears: 2,
    dateOfBirth: "2024-01-01",
    dateOfBirthIsApproximate: true,
  });
  assert.equal(age.ageIsApproximate, true);
  assert.equal(age.ageMonths, 24);
});

test("resolveWeightKgFromSources prefers SOAP Objective weight", () => {
  const objective = "Vitals: Weight: 12.5 kg\n\nP/A soft.";
  assert.equal(resolveWeightKgFromSources(objective, 18), 12.5);
  assert.equal(resolveWeightKgFromSources("Not documented in transcript.", 18), 18);
  assert.equal(resolveWeightKgFromSources("Not documented in transcript.", null), null);
});
