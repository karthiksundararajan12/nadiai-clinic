/**
 * @fileoverview Pure conversation_state expiry check (no I/O).
 */

import { CONVERSATION_EXPIRY_HOURS } from "../constants.js";

/**
 * @param {string|null} lastMessageAt  ISO timestamp of conversation_state.last_message_at.
 * @param {Date} [now=new Date()]
 * @returns {boolean} true when the conversation has been inactive past the expiry window.
 */
export function isConversationExpired(lastMessageAt, now = new Date()) {
  if (!lastMessageAt) return true;
  const last = new Date(lastMessageAt);
  if (Number.isNaN(last.getTime())) return true;
  const hoursSince = (now.getTime() - last.getTime()) / (1000 * 60 * 60);
  return hoursSince >= CONVERSATION_EXPIRY_HOURS;
}
