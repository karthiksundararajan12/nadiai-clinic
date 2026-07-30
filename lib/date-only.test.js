import test from "node:test";
import assert from "node:assert/strict";
import { formatDateOnly } from "./date-only.js";

test("formatDateOnly formats a plain YYYY-MM-DD string", () => {
  assert.equal(formatDateOnly("2026-01-01"), "01 Jan 2026");
  assert.equal(formatDateOnly("2026-12-05"), "05 Dec 2026");
});

test("formatDateOnly never shifts the calendar date regardless of local timezone", () => {
  // The historical bug this guards against: new Date("2026-01-01") is UTC
  // midnight, which `date-fns` `format()` (local-timezone) can render as
  // 31 Dec 2025 in negative-UTC-offset timezones. formatDateOnly parses the
  // digits directly and must never depend on the runtime's timezone.
  const originalTz = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles";
    assert.equal(formatDateOnly("2026-01-01"), "01 Jan 2026");
  } finally {
    process.env.TZ = originalTz;
  }
});

test("formatDateOnly ignores a trailing time/offset component", () => {
  assert.equal(formatDateOnly("2026-01-01T00:00:00.000Z"), "01 Jan 2026");
});

test("formatDateOnly returns an em dash for null/undefined/empty input", () => {
  assert.equal(formatDateOnly(null), "—");
  assert.equal(formatDateOnly(undefined), "—");
  assert.equal(formatDateOnly(""), "—");
});

test("formatDateOnly returns the raw value when it doesn't match YYYY-MM-DD", () => {
  assert.equal(formatDateOnly("not-a-date"), "not-a-date");
});
