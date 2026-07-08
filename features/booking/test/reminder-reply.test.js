import test from "node:test";
import assert from "node:assert/strict";
import { reminderReplyId, parseReminderReplyId } from "../lib/reminder-reply.js";
import { REMINDER_REPLY_ACTION } from "../constants.js";

test("reminderReplyId + parseReminderReplyId round-trip for each known action", () => {
  for (const action of Object.values(REMINDER_REPLY_ACTION)) {
    const id = reminderReplyId(action, "appt-123");
    const parsed = parseReminderReplyId(id);
    assert.deepEqual(parsed, { action, appointmentId: "appt-123" });
  }
});

test("parseReminderReplyId handles UUID-shaped appointment ids (contain no colon)", () => {
  const id = reminderReplyId(REMINDER_REPLY_ACTION.CANCEL, "3fa85f64-5717-4562-b3fc-2c963f66afa6");
  assert.deepEqual(parseReminderReplyId(id), {
    action: REMINDER_REPLY_ACTION.CANCEL,
    appointmentId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  });
});

test("parseReminderReplyId returns null for ids from other menus (e.g. slot-selection, patient-selection)", () => {
  assert.equal(parseReminderReplyId("booking_slot:2026-07-06T03:30:00.000Z"), null);
  assert.equal(parseReminderReplyId("booking_patient:abc-123"), null);
  assert.equal(parseReminderReplyId("booking_intent_book"), null);
});

test("parseReminderReplyId returns null for malformed reminder-prefixed ids", () => {
  assert.equal(parseReminderReplyId("booking_reminder_confirm"), null); // no colon/appointmentId
  assert.equal(parseReminderReplyId("booking_reminder_confirm:"), null); // empty appointmentId
  assert.equal(parseReminderReplyId("booking_reminder_unknown_action:appt-1"), null); // unknown action
});

test("parseReminderReplyId returns null for non-string / nullish input", () => {
  assert.equal(parseReminderReplyId(null), null);
  assert.equal(parseReminderReplyId(undefined), null);
  assert.equal(parseReminderReplyId(42), null);
});
