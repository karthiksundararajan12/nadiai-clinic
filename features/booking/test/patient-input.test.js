import test from "node:test";
import assert from "node:assert/strict";
import { validatePatientName, parseAgeOrDob } from "../lib/patient-input.js";

test("validatePatientName: rejects empty/whitespace-only names", () => {
  assert.equal(validatePatientName("").valid, false);
  assert.equal(validatePatientName("   ").valid, false);
  assert.equal(validatePatientName(null).valid, false);
  assert.equal(validatePatientName(undefined).valid, false);
});

test("validatePatientName: trims and collapses internal whitespace", () => {
  const result = validatePatientName("  Rohan   Sharma  ");
  assert.equal(result.valid, true);
  assert.equal(result.value, "Rohan Sharma");
});

test("validatePatientName: rejects unreasonably long names", () => {
  assert.equal(validatePatientName("a".repeat(200)).valid, false);
});

test("parseAgeOrDob: accepts a plain integer age within range", () => {
  const result = parseAgeOrDob("34");
  assert.equal(result.valid, true);
  assert.equal(result.ageYears, 34);
  assert.equal(result.dateOfBirth, null);
});

test("parseAgeOrDob: accepts age 0 and age 120 (inclusive boundaries)", () => {
  assert.equal(parseAgeOrDob("0").valid, true);
  assert.equal(parseAgeOrDob("120").valid, true);
});

test("parseAgeOrDob: rejects out-of-range ages", () => {
  assert.equal(parseAgeOrDob("121").valid, false);
  assert.equal(parseAgeOrDob("999").valid, false);
});

test("parseAgeOrDob: accepts DD-MM-YYYY date of birth and computes age", () => {
  const thirtyYearsAgo = new Date();
  thirtyYearsAgo.setFullYear(thirtyYearsAgo.getFullYear() - 30);
  const dd = String(thirtyYearsAgo.getDate()).padStart(2, "0");
  const mm = String(thirtyYearsAgo.getMonth() + 1).padStart(2, "0");
  const yyyy = thirtyYearsAgo.getFullYear();

  const result = parseAgeOrDob(`${dd}-${mm}-${yyyy}`);
  assert.equal(result.valid, true);
  assert.equal(result.ageYears, 30);
  assert.ok(result.dateOfBirth.startsWith(String(yyyy)));
});

test("parseAgeOrDob: accepts DD/MM/YYYY and YYYY-MM-DD formats", () => {
  assert.equal(parseAgeOrDob("15/06/1990").valid, true);
  assert.equal(parseAgeOrDob("1990-06-15").valid, true);
});

test("parseAgeOrDob: rejects a future date of birth", () => {
  const nextYear = new Date();
  nextYear.setFullYear(nextYear.getFullYear() + 1);
  const dd = String(nextYear.getDate()).padStart(2, "0");
  const mm = String(nextYear.getMonth() + 1).padStart(2, "0");
  const result = parseAgeOrDob(`${dd}-${mm}-${nextYear.getFullYear()}`);
  assert.equal(result.valid, false);
});

test("parseAgeOrDob: rejects unparsable free text", () => {
  assert.equal(parseAgeOrDob("not a date").valid, false);
  assert.equal(parseAgeOrDob("").valid, false);
});
