import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "../lib/signature.js";

const APP_SECRET = "test-app-secret";
const BODY = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

function sign(body, secret) {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

test("accepts a correctly signed payload", () => {
  const signature = sign(BODY, APP_SECRET);
  assert.equal(verifyMetaSignature(BODY, signature, APP_SECRET), true);
});

test("rejects a payload signed with the wrong secret", () => {
  const signature = sign(BODY, "wrong-secret");
  assert.equal(verifyMetaSignature(BODY, signature, APP_SECRET), false);
});

test("rejects a tampered body", () => {
  const signature = sign(BODY, APP_SECRET);
  const tamperedBody = JSON.stringify({ object: "whatsapp_business_account", entry: [{}] });
  assert.equal(verifyMetaSignature(tamperedBody, signature, APP_SECRET), false);
});

test("rejects a missing signature header", () => {
  assert.equal(verifyMetaSignature(BODY, null, APP_SECRET), false);
});

test("rejects a header missing the sha256= prefix", () => {
  const raw = createHmac("sha256", APP_SECRET).update(BODY, "utf8").digest("hex");
  assert.equal(verifyMetaSignature(BODY, raw, APP_SECRET), false);
});

test("rejects when appSecret is not configured", () => {
  const signature = sign(BODY, APP_SECRET);
  assert.equal(verifyMetaSignature(BODY, signature, undefined), false);
});
