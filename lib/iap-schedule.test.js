import test from "node:test";
import assert from "node:assert/strict";
import {
  IAP_IMMUNIZATION_SCHEDULE,
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
