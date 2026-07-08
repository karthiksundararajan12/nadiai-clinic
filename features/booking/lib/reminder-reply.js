/**
 * @fileoverview Pure encode/parse helpers for reminder quick-reply button
 * ids (no I/O) — mirrors the slotRowId/parseSlotRowId pattern in
 * lib/slot-engine.js.
 *
 * A reminder quick-reply (Confirm/Cancel/Reschedule) self-identifies its
 * target appointment directly in the button id, e.g.
 * `booking_reminder_confirm:3fa8...`. This is deliberate: unlike every
 * other reply in this codebase, reminder replies are NOT routed through
 * conversation_state (see constants.js's REMINDER_SENT section) — the
 * button id alone is enough to find and act on the right appointment,
 * regardless of whatever conversation_state the contact happens to be in.
 */

import { REMINDER_REPLY_ID_PREFIX, REMINDER_REPLY_ACTION } from "../constants.js";

const KNOWN_ACTIONS = new Set(Object.values(REMINDER_REPLY_ACTION));

/**
 * @param {string} action - One of REMINDER_REPLY_ACTION's values.
 * @param {string} appointmentId
 * @returns {string}
 */
export function reminderReplyId(action, appointmentId) {
  return `${REMINDER_REPLY_ID_PREFIX}${action}:${appointmentId}`;
}

/**
 * @param {string} replyId
 * @returns {{ action: string; appointmentId: string }|null} null if
 *   `replyId` isn't a reminder-reply id (e.g. it's some other menu's row/button id).
 */
export function parseReminderReplyId(replyId) {
  if (typeof replyId !== "string" || !replyId.startsWith(REMINDER_REPLY_ID_PREFIX)) return null;

  const rest = replyId.slice(REMINDER_REPLY_ID_PREFIX.length);
  const separatorIndex = rest.indexOf(":");
  if (separatorIndex === -1) return null;

  const action = rest.slice(0, separatorIndex);
  const appointmentId = rest.slice(separatorIndex + 1);
  if (!KNOWN_ACTIONS.has(action) || appointmentId.length === 0) return null;

  return { action, appointmentId };
}
