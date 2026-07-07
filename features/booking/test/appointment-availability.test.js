import test from "node:test";
import assert from "node:assert/strict";
import { isBlockingAppointmentRow } from "../lib/appointment-availability.js";

const NOW = new Date("2026-07-06T04:00:00.000Z").getTime();

test("a CONFIRMED row always blocks", () => {
  assert.equal(isBlockingAppointmentRow({ status: "confirmed", hold_expires_at: null }, NOW), true);
});

test("a PAYMENT_PENDING row with a hold that hasn't expired yet blocks", () => {
  const row = { status: "payment_pending", hold_expires_at: new Date(NOW + 5 * 60 * 1000).toISOString() };
  assert.equal(isBlockingAppointmentRow(row, NOW), true);
});

test("a PAYMENT_PENDING row whose hold has already expired no longer blocks — the slot is available again", () => {
  const row = { status: "payment_pending", hold_expires_at: new Date(NOW - 5 * 60 * 1000).toISOString() };
  assert.equal(isBlockingAppointmentRow(row, NOW), false);
});

test("a PAYMENT_PENDING row exactly at its expiry instant no longer blocks (strict > , not >=)", () => {
  const row = { status: "payment_pending", hold_expires_at: new Date(NOW).toISOString() };
  assert.equal(isBlockingAppointmentRow(row, NOW), false);
});

test("a PAYMENT_PENDING row with no hold_expires_at is treated as never-expiring (blocks) — safe default for legacy rows", () => {
  assert.equal(isBlockingAppointmentRow({ status: "payment_pending", hold_expires_at: null }, NOW), true);
  assert.equal(isBlockingAppointmentRow({ status: "payment_pending" }, NOW), true);
});

test("other non-cancelled/non-rescheduled statuses keep the pre-hold behavior of blocking", () => {
  assert.equal(isBlockingAppointmentRow({ status: "pending" }, NOW), true);
  assert.equal(isBlockingAppointmentRow({ status: "no_show" }, NOW), true);
  assert.equal(isBlockingAppointmentRow({ status: "completed" }, NOW), true);
});
