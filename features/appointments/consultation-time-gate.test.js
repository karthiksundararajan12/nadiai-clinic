import test from "node:test";
import assert from "node:assert/strict";
import {
  EARLY_CONSULTATION_NUDGE_MS,
  shouldNudgeEarlyConsultation,
} from "./consultation-time-gate.js";

const NOW = new Date("2026-07-31T10:00:00.000Z");

test("nudges when slot_start is more than 2 hours in the future", () => {
  const slot = new Date(NOW.getTime() + EARLY_CONSULTATION_NUDGE_MS + 60_000);
  assert.equal(shouldNudgeEarlyConsultation(slot.toISOString(), NOW), true);
});

test("does not nudge when slot_start is exactly 2 hours ahead", () => {
  const slot = new Date(NOW.getTime() + EARLY_CONSULTATION_NUDGE_MS);
  assert.equal(shouldNudgeEarlyConsultation(slot.toISOString(), NOW), false);
});

test("does not nudge when slot_start is within 2 hours (before)", () => {
  const slot = new Date(NOW.getTime() + 30 * 60_000);
  assert.equal(shouldNudgeEarlyConsultation(slot.toISOString(), NOW), false);
});

test("does not nudge when slot_start is in the past (running behind)", () => {
  const slot = new Date(NOW.getTime() - 3 * 60 * 60_000);
  assert.equal(shouldNudgeEarlyConsultation(slot.toISOString(), NOW), false);
});

test("does not nudge for missing / invalid slot_start", () => {
  assert.equal(shouldNudgeEarlyConsultation(null, NOW), false);
  assert.equal(shouldNudgeEarlyConsultation(undefined, NOW), false);
  assert.equal(shouldNudgeEarlyConsultation("not-a-date", NOW), false);
});
