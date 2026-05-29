import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeIndianPhoneNumber,
  parsePhoneForMeta,
  buildMetaWebhookUrl,
} from "./clinic-setup.js";

test("normalizeIndianPhoneNumber converts local numbers to +91 format", () => {
  assert.equal(normalizeIndianPhoneNumber("99636 61918"), "+919963661918");
});

test("normalizeIndianPhoneNumber preserves explicit country code", () => {
  assert.equal(normalizeIndianPhoneNumber("+1 555-629-9084"), "+15556299084");
});

test("parsePhoneForMeta returns cc + local phone components", () => {
  const parsed = parsePhoneForMeta("+919963661918");
  assert.deepEqual(parsed, {
    display: "+919963661918",
    cc: "91",
    phoneNumber: "9963661918",
  });
});

test("buildMetaWebhookUrl builds canonical webhook endpoint", () => {
  assert.equal(
    buildMetaWebhookUrl("https://app.nadiai.in/"),
    "https://app.nadiai.in/api/whatsapp/webhook"
  );
});
