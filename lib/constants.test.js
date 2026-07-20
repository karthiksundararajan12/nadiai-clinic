import test from "node:test";
import assert from "node:assert/strict";
import {
  APPOINTMENT_STATUS_CONFIG,
  PATIENT_STATUS_CONFIG,
} from "./constants.js";

// The appointments dashboard renders appointment.status values coming from
// features/booking/constants.js's APPOINTMENT_STATUS (pending, payment_pending,
// confirmed, cancelled, rescheduled, reschedule_requested, no_show, completed).
// Every one of those real values must resolve to a StatusBadge config entry —
// components/shared/status-badge.jsx silently renders nothing otherwise.
const REAL_BOOKING_STATUSES = [
  "pending",
  "payment_pending",
  "confirmed",
  "cancelled",
  "rescheduled",
  "reschedule_requested",
  "no_show",
  "completed",
];

test("APPOINTMENT_STATUS_CONFIG has an entry for every real booking status value", () => {
  for (const status of REAL_BOOKING_STATUSES) {
    assert.ok(
      APPOINTMENT_STATUS_CONFIG[status],
      `missing StatusBadge config for status "${status}"`,
    );
  }
});

test("newly added pending-family statuses have a label and color, each distinct from one another", () => {
  const newStatuses = [
    "pending",
    "payment_pending",
    "rescheduled",
    "reschedule_requested",
  ];
  const seenColors = new Set();
  for (const status of newStatuses) {
    const config = APPOINTMENT_STATUS_CONFIG[status];
    assert.ok(config.label, `status "${status}" is missing a label`);
    assert.ok(config.color, `status "${status}" is missing color classes`);
    assert.ok(
      !seenColors.has(config.color),
      `status "${status}" reuses a color already used by another new status`,
    );
    seenColors.add(config.color);
  }
});

test("PATIENT_STATUS_CONFIG active maps to success bordered-pill tokens", () => {
  const active = PATIENT_STATUS_CONFIG.active;
  assert.equal(active.label, "Active");
  assert.equal(active.variant, "success");
  assert.match(active.color, /border-success/);
  assert.match(active.color, /bg-success/);
  assert.match(active.color, /text-success/);
});
