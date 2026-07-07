import test from "node:test";
import assert from "node:assert/strict";
import { parseInboundWhatsAppWebhook } from "../lib/webhook-parser.js";

function buildPayload(value) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "waba-1", changes: [{ field: "messages", value }] }],
  };
}

test("parses a plain text message", () => {
  const payload = buildPayload({
    messaging_product: "whatsapp",
    metadata: { phone_number_id: "PNID_1", display_phone_number: "911234567890" },
    contacts: [{ profile: { name: "Asha" }, wa_id: "919876543210" }],
    messages: [
      { from: "919876543210", id: "wamid.ABC", timestamp: "1710000000", type: "text", text: { body: "Hi" } },
    ],
  });

  const [message] = parseInboundWhatsAppWebhook(payload);
  assert.equal(message.phoneNumberId, "PNID_1");
  assert.equal(message.waMessageId, "wamid.ABC");
  assert.equal(message.contactPhone, "919876543210");
  assert.equal(message.contactName, "Asha");
  assert.equal(message.type, "text");
  assert.equal(message.text, "Hi");
});

test("parses an interactive list_reply", () => {
  const payload = buildPayload({
    metadata: { phone_number_id: "PNID_1" },
    contacts: [{ profile: { name: "Asha" }, wa_id: "919876543210" }],
    messages: [
      {
        from: "919876543210",
        id: "wamid.LIST",
        timestamp: "1710000001",
        type: "interactive",
        interactive: { type: "list_reply", list_reply: { id: "booking_intent_book", title: "Book an appointment" } },
      },
    ],
  });

  const [message] = parseInboundWhatsAppWebhook(payload);
  assert.equal(message.type, "list_reply");
  assert.equal(message.replyId, "booking_intent_book");
  assert.equal(message.replyTitle, "Book an appointment");
});

test("parses an interactive button_reply", () => {
  const payload = buildPayload({
    metadata: { phone_number_id: "PNID_1" },
    contacts: [{ profile: { name: "Asha" }, wa_id: "919876543210" }],
    messages: [
      {
        from: "919876543210",
        id: "wamid.BTN",
        timestamp: "1710000002",
        type: "interactive",
        interactive: { type: "button_reply", button_reply: { id: "confirm", title: "Confirm" } },
      },
    ],
  });

  const [message] = parseInboundWhatsAppWebhook(payload);
  assert.equal(message.type, "button_reply");
  assert.equal(message.replyId, "confirm");
});

test("status-only callbacks (no messages array) produce no normalized messages", () => {
  const payload = buildPayload({
    metadata: { phone_number_id: "PNID_1" },
    statuses: [{ id: "wamid.ABC", status: "delivered" }],
  });

  assert.deepEqual(parseInboundWhatsAppWebhook(payload), []);
});

test("unsupported message types are still surfaced as type 'unknown'", () => {
  const payload = buildPayload({
    metadata: { phone_number_id: "PNID_1" },
    contacts: [{ profile: { name: "Asha" }, wa_id: "919876543210" }],
    messages: [{ from: "919876543210", id: "wamid.LOC", timestamp: "1710000003", type: "location" }],
  });

  const [message] = parseInboundWhatsAppWebhook(payload);
  assert.equal(message.type, "unknown");
});
