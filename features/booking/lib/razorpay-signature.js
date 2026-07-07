/**
 * @fileoverview Razorpay webhook signature verification (no I/O).
 *
 * Razorpay signs every webhook POST body with the webhook secret (HMAC
 * SHA-256 over the raw body, hex digest) and sends it in the
 * `X-Razorpay-Signature` header — unlike Meta's `X-Hub-Signature-256`,
 * there's no `sha256=` prefix, just the raw hex digest. As with Meta, the
 * signature MUST be computed over the raw request bytes/string — never a
 * JSON.parse -> JSON.stringify round-trip.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * @param {string} rawBody          Raw request body exactly as received.
 * @param {string|null} signatureHeader  Value of the X-Razorpay-Signature header.
 * @param {string} webhookSecret    Razorpay webhook secret (dashboard-configured).
 * @returns {boolean}
 */
export function verifyRazorpaySignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;

  const computedHex = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");

  let expected;
  let computed;
  try {
    expected = Buffer.from(signatureHeader, "hex");
    computed = Buffer.from(computedHex, "hex");
  } catch {
    return false;
  }

  if (expected.length === 0 || expected.length !== computed.length) return false;
  return timingSafeEqual(expected, computed);
}
