/**
 * @fileoverview Pure formatting helpers for the HUMAN_HANDOFF doctor
 * notification (no I/O).
 */

/**
 * Renders a short, human-readable description of the inbound message that
 * triggered HUMAN_HANDOFF, for inclusion in the doctor's notification.
 *
 * @param {import("./webhook-parser.js").NormalizedInboundMessage} message
 * @returns {string}
 */
export function describeInboundMessageForHandoff(message) {
  if (message.type === "text") {
    const body = message.text?.trim();
    return body ? `"${body}"` : "(empty message)";
  }
  if (message.type === "button_reply" || message.type === "list_reply") {
    return `Selected: "${message.replyTitle ?? message.replyId}"`;
  }
  return `(unsupported message type: ${message.type})`;
}

/**
 * @param {import("./webhook-parser.js").NormalizedInboundMessage} message
 * @returns {string}
 */
export function describeContactForHandoff(message) {
  return message.contactName
    ? `${message.contactName} (${message.contactPhone})`
    : message.contactPhone;
}
