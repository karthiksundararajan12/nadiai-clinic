/**
 * @fileoverview Meta webhook signature verification (no I/O).
 *
 * Meta signs every webhook POST body with the app secret and sends the
 * digest in `X-Hub-Signature-256: sha256=<hex>`. The signature MUST be
 * computed over the raw request bytes/string — never over a re-serialized
 * JSON.parse(...) → JSON.stringify(...) round-trip, which is not
 * guaranteed to be byte-identical to what Meta signed.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * @param {string} rawBody       Raw request body exactly as received.
 * @param {string|null} signatureHeader  Value of the X-Hub-Signature-256 header.
 * @param {string} appSecret     Meta app secret.
 * @returns {boolean}
 */
export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  if (!appSecret) return false;

  const expectedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const computedHex = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  const computed = Buffer.from(computedHex, "hex");

  if (expected.length !== computed.length) return false;
  return timingSafeEqual(expected, computed);
}
