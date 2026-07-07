/**
 * @fileoverview Pure parser for Meta WhatsApp Cloud API webhook payloads
 * (no I/O). Normalizes the deeply-nested `entry[].changes[].value` shape
 * into a flat list of inbound messages the rest of the booking domain
 * can work with, and silently drops anything that isn't an inbound
 * customer message (e.g. delivery/read `statuses` callbacks).
 *
 * @typedef {Object} NormalizedInboundMessage
 * @property {string} phoneNumberId   Meta phone_number_id that received the message (routes to clinic_id).
 * @property {string} waMessageId     Meta's wamid — idempotency key.
 * @property {string} contactPhone    Sender's WhatsApp number (E.164-ish, no "+").
 * @property {string|null} contactName
 * @property {"text"|"button_reply"|"list_reply"|"unknown"} type
 * @property {string|null} text        Free-text body (type === "text").
 * @property {string|null} replyId     Button/list row id (type === "button_reply"|"list_reply").
 * @property {string|null} replyTitle  Button/list row title, for logging/fallback display.
 * @property {string} timestamp        Unix seconds (as string, per Meta's payload).
 */

/**
 * @param {unknown} payload  Parsed JSON body of the webhook POST.
 * @returns {NormalizedInboundMessage[]}
 */
export function parseInboundWhatsAppWebhook(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  /** @type {NormalizedInboundMessage[]} */
  const normalized = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value;
      if (!value || !Array.isArray(value.messages)) continue; // status-only callback, skip

      const phoneNumberId = value.metadata?.phone_number_id ?? null;
      if (!phoneNumberId) continue;

      const contactsByWaId = new Map(
        (Array.isArray(value.contacts) ? value.contacts : []).map((c) => [c.wa_id, c]),
      );

      for (const message of value.messages) {
        const contact = contactsByWaId.get(message.from);
        normalized.push(normalizeMessage(message, phoneNumberId, contact));
      }
    }
  }

  return normalized;
}

/**
 * @param {any} message
 * @param {string} phoneNumberId
 * @param {any} [contact]
 * @returns {NormalizedInboundMessage}
 */
function normalizeMessage(message, phoneNumberId, contact) {
  const base = {
    phoneNumberId,
    waMessageId:  message.id,
    contactPhone: message.from,
    contactName:  contact?.profile?.name ?? null,
    timestamp:    message.timestamp,
    text:         null,
    replyId:      null,
    replyTitle:   null,
  };

  if (message.type === "text") {
    return { ...base, type: "text", text: message.text?.body ?? "" };
  }

  if (message.type === "interactive") {
    const interactive = message.interactive ?? {};
    if (interactive.type === "button_reply") {
      return {
        ...base,
        type: "button_reply",
        replyId: interactive.button_reply?.id ?? null,
        replyTitle: interactive.button_reply?.title ?? null,
      };
    }
    if (interactive.type === "list_reply") {
      return {
        ...base,
        type: "list_reply",
        replyId: interactive.list_reply?.id ?? null,
        replyTitle: interactive.list_reply?.title ?? null,
      };
    }
  }

  return { ...base, type: "unknown" };
}
