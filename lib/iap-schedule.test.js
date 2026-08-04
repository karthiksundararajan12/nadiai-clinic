import test from "node:test";
import assert from "node:assert/strict";
import {
  IAP_IMMUNIZATION_SCHEDULE,
  IAP_VACCINE_NAMES,
  addDaysToDateString,
  computeIapDueDates,
} from "./iap-schedule.js";

test("addDaysToDateString adds days within a month", () => {
  assert.equal(addDaysToDateString("2026-01-01", 10), "2026-01-11");
});

test("addDaysToDateString rolls over month and year boundaries", () => {
  assert.equal(addDaysToDateString("2026-01-25", 10), "2026-02-04");
  assert.equal(addDaysToDateString("2026-12-25", 10), "2027-01-04");
});

test("addDaysToDateString supports negative offsets", () => {
  assert.equal(addDaysToDateString("2026-01-05", -10), "2025-12-26");
});

test("addDaysToDateString handles leap years", () => {
  assert.equal(addDaysToDateString("2028-02-28", 1), "2028-02-29");
  assert.equal(addDaysToDateString("2027-02-28", 1), "2027-03-01");
});

test("computeIapDueDates returns one entry per schedule row, in order, offset from date_of_birth", () => {
  const dob = "2026-01-01";
  const result = computeIapDueDates(dob);

  assert.equal(result.length, IAP_IMMUNIZATION_SCHEDULE.length);
  result.forEach((entry, i) => {
    assert.equal(entry.vaccineName, IAP_IMMUNIZATION_SCHEDULE[i].vaccineName);
    assert.equal(entry.dueDate, addDaysToDateString(dob, IAP_IMMUNIZATION_SCHEDULE[i].offsetDays));
  });

  // Spot-check a few well-known milestones.
  assert.equal(result.find((e) => e.vaccineName === "BCG").dueDate, "2026-01-01");
  assert.equal(result.find((e) => e.vaccineName === "MMR - 1").dueDate, "2026-09-28"); // 270 days
});

test("computeIapDueDates due dates are non-decreasing (schedule is defined in chronological order)", () => {
  const result = computeIapDueDates("2026-01-01");
  for (let i = 1; i < result.length; i += 1) {
    assert.ok(
      result[i].dueDate >= result[i - 1].dueDate,
      `entry ${i} (${result[i].vaccineName}) due ${result[i].dueDate} is before entry ${i - 1} (${result[i - 1].vaccineName}) due ${result[i - 1].dueDate}`,
    );
  }
});

test("IAP_VACCINE_NAMES has no duplicate entries", () => {
  assert.equal(IAP_VACCINE_NAMES.length, new Set(IAP_VACCINE_NAMES).size);
});

test("IAP_VACCINE_NAMES keeps distinct multi-dose entries separate (e.g. MMR - 1 vs MMR - 2 vs MMR - 3)", () => {
  assert.ok(IAP_VACCINE_NAMES.includes("MMR - 1"));
  assert.ok(IAP_VACCINE_NAMES.includes("MMR - 2"));
  assert.ok(IAP_VACCINE_NAMES.includes("MMR - 3"));
});

test("IAP_VACCINE_NAMES reflects IAP-ACVIP 2023: Tdap/Td split, no Typhoid booster", () => {
  assert.ok(IAP_VACCINE_NAMES.includes("Tdap"));
  assert.ok(IAP_VACCINE_NAMES.includes("Td"));
  assert.equal(IAP_VACCINE_NAMES.includes("Tdap/Td"), false);
  assert.equal(IAP_VACCINE_NAMES.includes("Typhoid - Booster"), false);
  assert.ok(IAP_VACCINE_NAMES.includes("Typhoid Conjugate Vaccine (TCV)"));
});

test("IAP_VACCINE_NAMES has expected ACVIP 2023 entry count", () => {
  assert.equal(IAP_VACCINE_NAMES.length, 40);
  assert.equal(IAP_IMMUNIZATION_SCHEDULE.length, 40);
});

test("IAP_VACCINE_NAMES contains every vaccineName from IAP_IMMUNIZATION_SCHEDULE, order-preserved by first occurrence", () => {
  const expected = [];
  for (const entry of IAP_IMMUNIZATION_SCHEDULE) {
    if (!expected.includes(entry.vaccineName)) expected.push(entry.vaccineName);
  }
  assert.deepEqual([...IAP_VACCINE_NAMES], expected);
});
