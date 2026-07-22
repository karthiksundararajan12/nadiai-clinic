/**
 * Guards patient-facing confirmation copy against leaking developer
 * meta-commentary (e.g. "Buttons: None…", "quick-reply") into WhatsApp.
 *
 * Paid confirmations are Meta template `appt_booking_confirmed` (static
 * body on Meta + five bodyParams from PaymentWebhookService) — not LLM.
 * Free confirmations use SLOT_SELECTION_COPY.CONFIRMED plain text.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  BOOKING_CONFIRMED_TEMPLATE_BODY,
  BOOKING_CONFIRMED_TEMPLATE_NAME,
  PAYMENT_WEBHOOK_COPY,
  SLOT_SELECTION_COPY,
} from "../constants.js";

const FORBIDDEN_SUBSTRINGS = ["Buttons:", "quick-reply", "quick reply"];

function assertNoMetaCommentary(label, text) {
  assert.equal(typeof text, "string");
  assert.ok(text.trim().length > 0, `${label} must be non-empty`);
  for (const needle of FORBIDDEN_SUBSTRINGS) {
    assert.equal(
      text.toLowerCase().includes(needle.toLowerCase()),
      false,
      `${label} must not contain patient-visible meta-commentary "${needle}"`,
    );
  }
}

test("BOOKING_CONFIRMED_TEMPLATE_BODY is the clean Meta body (no button commentary)", () => {
  assert.equal(BOOKING_CONFIRMED_TEMPLATE_NAME, "appt_booking_confirmed");
  assertNoMetaCommentary("BOOKING_CONFIRMED_TEMPLATE_BODY", BOOKING_CONFIRMED_TEMPLATE_BODY);
  assert.match(BOOKING_CONFIRMED_TEMPLATE_BODY, /arrive 10 minutes early/i);
  assert.match(BOOKING_CONFIRMED_TEMPLATE_BODY, /\{\{1\}\}/);
  assert.match(BOOKING_CONFIRMED_TEMPLATE_BODY, /\{\{5\}\}/);
});

test("PAYMENT_WEBHOOK_COPY.PAYMENT_CONFIRMED plain-text fallback has no button commentary", () => {
  assertNoMetaCommentary("PAYMENT_CONFIRMED", PAYMENT_WEBHOOK_COPY.PAYMENT_CONFIRMED);
});

test("SLOT_SELECTION_COPY.CONFIRMED (fee-free path) has no button commentary", () => {
  assertNoMetaCommentary("SLOT_SELECTION CONFIRMED", SLOT_SELECTION_COPY.CONFIRMED);
});
