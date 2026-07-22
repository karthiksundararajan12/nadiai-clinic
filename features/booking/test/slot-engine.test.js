import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWorkingHours,
  generateCandidateSlots,
  formatSlotLabel,
  formatSlotDateTimeParts,
  slotRowId,
  parseSlotRowId,
} from "../lib/slot-engine.js";

// ─────────────────────────────────────────────────────────────
// normalizeWorkingHours
// ─────────────────────────────────────────────────────────────

test("normalizeWorkingHours: valid HH:mm values pass through unchanged", () => {
  const result = normalizeWorkingHours("09:00", "18:00");
  assert.deepEqual(result, { start: "09:00", end: "18:00", usedFallback: false });
});

test("normalizeWorkingHours: null/undefined falls back to defaults", () => {
  const result = normalizeWorkingHours(null, undefined);
  assert.equal(result.usedFallback, true);
  assert.equal(result.start, "09:00");
  assert.equal(result.end, "18:00");
});

test("normalizeWorkingHours: malformed strings fall back to defaults", () => {
  const result = normalizeWorkingHours("9am", "6pm");
  assert.equal(result.usedFallback, true);
});

test("normalizeWorkingHours: end <= start falls back to defaults", () => {
  const result = normalizeWorkingHours("18:00", "09:00");
  assert.equal(result.usedFallback, true);
});

// ─────────────────────────────────────────────────────────────
// generateCandidateSlots
// ─────────────────────────────────────────────────────────────

test("generateCandidateSlots: evenly spaces slots within working hours for one day", () => {
  // now = 2026-07-06T02:00:00Z = 07:30 IST, well before the 09:00 IST start.
  const now = new Date("2026-07-06T02:00:00.000Z");
  const slots = generateCandidateSlots({
    workingHoursStart: "09:00",
    workingHoursEnd: "11:00",
    consultationDurationMinutes: 30,
    daysAhead: 1,
    minLeadMinutes: 0,
    now,
  });

  // 09:00-11:00 IST at 30-minute increments -> 4 slots: 09:00, 09:30, 10:00, 10:30.
  assert.equal(slots.length, 4);
  assert.equal(slots[0].slotStart.toISOString(), "2026-07-06T03:30:00.000Z"); // 09:00 IST
  assert.equal(slots[0].slotEnd.toISOString(), "2026-07-06T04:00:00.000Z");
  assert.equal(slots[3].slotStart.toISOString(), "2026-07-06T05:00:00.000Z"); // 10:30 IST
});

test("generateCandidateSlots: excludes slots closer than minLeadMinutes to now", () => {
  // now = 2026-07-06T03:45:00Z = 09:15 IST — the 09:00 slot has already started,
  // and with a 60-minute lead time nothing before 10:15 IST should be offered.
  const now = new Date("2026-07-06T03:45:00.000Z");
  const slots = generateCandidateSlots({
    workingHoursStart: "09:00",
    workingHoursEnd: "12:00",
    consultationDurationMinutes: 30,
    daysAhead: 1,
    minLeadMinutes: 60,
    now,
  });

  for (const slot of slots) {
    assert.ok(slot.slotStart.getTime() >= now.getTime() + 60 * 60 * 1000);
  }
  // 10:30, 11:00, 11:30 IST survive the lead-time + working-hours filter.
  assert.equal(slots.length, 3);
});

test("generateCandidateSlots: generates slots across multiple days", () => {
  const now = new Date("2026-07-06T00:00:00.000Z"); // 05:30 IST
  const slots = generateCandidateSlots({
    workingHoursStart: "09:00",
    workingHoursEnd: "10:00",
    consultationDurationMinutes: 30,
    daysAhead: 3,
    minLeadMinutes: 0,
    now,
  });

  // 2 slots/day (09:00, 09:30) x 3 days = 6.
  assert.equal(slots.length, 6);
  const days = new Set(slots.map((s) => s.slotStart.toISOString().slice(0, 10)));
  assert.equal(days.size, 3);
});

test("generateCandidateSlots: no partial slot is generated if duration doesn't evenly divide working hours", () => {
  const now = new Date("2026-07-06T00:00:00.000Z");
  const slots = generateCandidateSlots({
    workingHoursStart: "09:00",
    workingHoursEnd: "10:15", // 75 minutes — only room for two 30-min slots, not three
    consultationDurationMinutes: 30,
    daysAhead: 1,
    minLeadMinutes: 0,
    now,
  });
  assert.equal(slots.length, 2);
});

test("generateCandidateSlots: 09:00–18:00 / 20min from 12:31 PM includes last slot at 17:40", () => {
  // 12:31 PM IST = 07:01 UTC. Close-time check is slotEnd <= working_hours_end,
  // so 17:40–18:00 is valid and must not be dropped by generation itself.
  const now = new Date("2026-07-06T07:01:00.000Z");
  const slots = generateCandidateSlots({
    workingHoursStart: "09:00",
    workingHoursEnd: "18:00",
    consultationDurationMinutes: 20,
    daysAhead: 1,
    minLeadMinutes: 0,
    now,
  });

  const startsIstHhmm = slots.map((s) => {
    const ist = new Date(s.slotStart.getTime() + 5.5 * 60 * 60 * 1000);
    return `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`;
  });

  assert.ok(slots.length > 10, `expected more than a WhatsApp page of slots, got ${slots.length}`);
  assert.ok(startsIstHhmm.includes("17:40"), `missing 17:40; got ${startsIstHhmm.slice(-5).join(", ")}`);
  assert.equal(startsIstHhmm.at(-1), "17:40");
  // Last slot must end exactly at close, not past it.
  const last = slots.at(-1);
  const lastEndIst = new Date(last.slotEnd.getTime() + 5.5 * 60 * 60 * 1000);
  assert.equal(lastEndIst.getUTCHours(), 18);
  assert.equal(lastEndIst.getUTCMinutes(), 0);
});

// ─────────────────────────────────────────────────────────────
// formatSlotLabel
// ─────────────────────────────────────────────────────────────

test("formatSlotLabel: formats an AM slot in IST, under Meta's 24-char row title limit", () => {
  const label = formatSlotLabel(new Date("2026-07-06T03:30:00.000Z")); // Mon 6 Jul, 09:00 AM IST
  assert.equal(label, "Mon 6 Jul, 9:00 AM");
  assert.ok(label.length <= 24);
});

test("formatSlotDateTimeParts: splits IST date and time for confirmed-fallback copy", () => {
  const parts = formatSlotDateTimeParts(new Date("2026-07-06T03:30:00.000Z"));
  assert.deepEqual(parts, { date: "Mon 6 Jul", time: "9:00 AM" });
});

test("formatSlotLabel: formats a PM slot correctly (noon boundary)", () => {
  const label = formatSlotLabel(new Date("2026-07-06T06:30:00.000Z")); // 12:00 PM IST
  assert.equal(label, "Mon 6 Jul, 12:00 PM");
});

test("formatSlotLabel: two-digit day stays under the 24-char limit", () => {
  const label = formatSlotLabel(new Date("2026-07-16T10:30:00.000Z")); // Thu 16 Jul, 4:00 PM IST
  assert.ok(label.length <= 24, label);
});

// ─────────────────────────────────────────────────────────────
// slotRowId / parseSlotRowId
// ─────────────────────────────────────────────────────────────

test("slotRowId/parseSlotRowId: round-trips a slot start timestamp", () => {
  const date = new Date("2026-07-06T03:30:00.000Z");
  const rowId = slotRowId(date);
  assert.ok(rowId.startsWith("booking_slot:"));
  assert.equal(parseSlotRowId(rowId), date.toISOString());
});

test("parseSlotRowId: returns null for a non-slot row id", () => {
  assert.equal(parseSlotRowId("booking_patient:abc-123"), null);
  assert.equal(parseSlotRowId(null), null);
  assert.equal(parseSlotRowId(undefined), null);
});

test("parseSlotRowId: returns null for a malformed timestamp suffix", () => {
  assert.equal(parseSlotRowId("booking_slot:not-a-date"), null);
});
