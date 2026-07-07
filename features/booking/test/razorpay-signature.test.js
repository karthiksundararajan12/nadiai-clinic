import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyRazorpaySignature } from "../lib/razorpay-signature.js";

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1" } } } });

function sign(body, secret) {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

test("verifyRazorpaySignature: accepts a correctly signed payload", () => {
  const signature = sign(BODY, SECRET);
  assert.equal(verifyRazorpaySignature(BODY, signature, SECRET), true);
});

test("verifyRazorpaySignature: rejects a tampered body signed for different content", () => {
  const signature = sign(BODY, SECRET);
  const tamperedBody = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_EVIL" } } } });
  assert.equal(verifyRazorpaySignature(tamperedBody, signature, SECRET), false);
});

test("verifyRazorpaySignature: rejects a signature computed with the wrong secret", () => {
  const signature = sign(BODY, "wrong-secret");
  assert.equal(verifyRazorpaySignature(BODY, signature, SECRET), false);
});

test("verifyRazorpaySignature: rejects a missing signature header", () => {
  assert.equal(verifyRazorpaySignature(BODY, null, SECRET), false);
  assert.equal(verifyRazorpaySignature(BODY, "", SECRET), false);
});

test("verifyRazorpaySignature: rejects when the webhook secret isn't configured", () => {
  const signature = sign(BODY, SECRET);
  assert.equal(verifyRazorpaySignature(BODY, signature, undefined), false);
});

test("verifyRazorpaySignature: rejects a garbage (non-hex) signature header without throwing", () => {
  assert.equal(verifyRazorpaySignature(BODY, "not-a-hex-signature!!", SECRET), false);
});

test("verifyRazorpaySignature: rejects a well-formed but incorrect hex signature of the same length", () => {
  const signature = sign(BODY, SECRET);
  const flipped = (signature[0] === "0" ? "1" : "0") + signature.slice(1);
  assert.equal(verifyRazorpaySignature(BODY, flipped, SECRET), false);
});
