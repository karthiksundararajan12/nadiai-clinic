import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneForWhatsApp, formatPhoneForDisplay } from "../lib/phone.js";
import { describeInboundMessageForHandoff, describeContactForHandoff } from "../lib/handoff-summary.js";

test("normalizePhoneForWhatsApp strips formatting down to digits", () => {
  assert.equal(normalizePhoneForWhatsApp("+91 98765-00000"), "919876500000");
  assert.equal(normalizePhoneForWhatsApp("(987) 650-0000"), "9876500000");
});

test("normalizePhoneForWhatsApp returns null for empty/unusable input", () => {
  assert.equal(normalizePhoneForWhatsApp(null), null);
  assert.equal(normalizePhoneForWhatsApp(undefined), null);
  assert.equal(normalizePhoneForWhatsApp(""), null);
  assert.equal(normalizePhoneForWhatsApp("N/A"), null);
});

test("formatPhoneForDisplay adds + and space after Indian country code", () => {
  assert.equal(formatPhoneForDisplay("919840227132"), "+91 9840227132");
  assert.equal(formatPhoneForDisplay("+91 98402-27132"), "+91 9840227132");
});

test("describeInboundMessageForHandoff quotes free text", () => {
  assert.equal(
    describeInboundMessageForHandoff({ type: "text", text: "what does this mean?" }),
    '"what does this mean?"',
  );
});

test("describeInboundMessageForHandoff handles empty text", () => {
  assert.equal(describeInboundMessageForHandoff({ type: "text", text: "   " }), "(empty message)");
});

test("describeInboundMessageForHandoff describes an unrecognized button/list reply", () => {
  assert.equal(
    describeInboundMessageForHandoff({ type: "button_reply", replyId: "xyz", replyTitle: "Something Else" }),
    'Selected: "Something Else"',
  );
});

test("describeInboundMessageForHandoff falls back for unsupported types", () => {
  assert.equal(describeInboundMessageForHandoff({ type: "location" }), "(unsupported message type: location)");
});

test("describeContactForHandoff includes the name when present", () => {
  assert.equal(
    describeContactForHandoff({ contactName: "Asha", contactPhone: "919876543210" }),
    "Asha (919876543210)",
  );
});

test("describeContactForHandoff falls back to phone only when no name", () => {
  assert.equal(describeContactForHandoff({ contactName: null, contactPhone: "919876543210" }), "919876543210");
});
