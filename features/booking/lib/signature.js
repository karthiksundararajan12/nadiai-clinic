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
 * @param {string|Buffer|Uint8Array} rawBody  Raw request body exactly as received.
 * @param {string|null} signatureHeader  Value of the X-Hub-Signature-256 header.
 * @param {string} appSecret     Meta app secret (App Settings → Basic → App Secret).
 * @returns {boolean}
 */
export function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader || !signatureHeader.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  if (!appSecret) return false;

  const expectedHex = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const computedHex = createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const expected = Buffer.from(expectedHex, "hex");
  const computed = Buffer.from(computedHex, "hex");

  if (expected.length !== computed.length) return false;
  return timingSafeEqual(expected, computed);
}

/**
 * TEMP debug — first 8 hex chars of computed vs received digest.
 * Do not log full signatures or the app secret.
 *
 * @param {string|Buffer|Uint8Array} rawBody
 * @param {string|null} signatureHeader
 * @param {string} [appSecret]
 */
export function metaSignatureDebug(rawBody, signatureHeader, appSecret) {
  const receivedHex = signatureHeader?.startsWith(SIGNATURE_PREFIX)
    ? signatureHeader.slice(SIGNATURE_PREFIX.length)
    : "";
  const computedHex = appSecret
    ? createHmac("sha256", appSecret).update(rawBody ?? "").digest("hex")
    : "";
  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(rawBody ?? "", typeof rawBody === "string" ? "utf8" : undefined);
  return {
    computedSigPrefix: computedHex.slice(0, 8) || "(none)",
    receivedSigPrefix: receivedHex.slice(0, 8) || "(none)",
    bodyByteLength: bodyBuffer.length,
    rawBodyType: Buffer.isBuffer(rawBody) ? "Buffer" : typeof rawBody,
    rawBodyPreview: bodyBuffer.toString("utf8", 0, Math.min(100, bodyBuffer.length)),
  };
}
