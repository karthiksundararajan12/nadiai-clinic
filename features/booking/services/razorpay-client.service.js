/**
 * @fileoverview Thin client for the Razorpay Payment Links + Refunds APIs.
 *
 * Correlation with the webhook: `notes` passed to `createPaymentLink` are
 * copied by Razorpay onto the resulting Payment entity, so
 * PaymentWebhookService can read them back from `payload.payment.entity.notes`
 * in the "payment.captured"/"payment.failed" webhook — see that file's
 * header comment. This client always stamps `appointment_id` and
 * `clinic_id` for that purpose; callers should not omit them.
 *
 * Auth: HTTP Basic with RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET (Razorpay's
 * documented auth scheme for server-side API calls) — not a per-clinic
 * credential; centralized the same way Meta auth is (see
 * WhatsAppClientService).
 */

import { RazorpayCredentialsError, RazorpaySendError } from "../errors.js";
import { createLogger } from "../logger.js";

const PAYMENT_LINKS_URL = "https://api.razorpay.com/v1/payment_links";
const PAYMENTS_URL = "https://api.razorpay.com/v1/payments";
const CURRENCY = "INR";

export class RazorpayClientService {
  /** @param {{ keyId: string; keySecret: string }} config */
  constructor({ keyId, keySecret } = {}) {
    if (!keyId || !keySecret) {
      throw new RazorpayCredentialsError(
        "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET is not configured — cannot create Razorpay payment links",
      );
    }
    this._keyId = keyId;
    this._keySecret = keySecret;
    this._log = createLogger({ component: "RazorpayClientService" });
  }

  /** @returns {string} */
  _basicAuthHeader() {
    return `Basic ${Buffer.from(`${this._keyId}:${this._keySecret}`).toString("base64")}`;
  }

  /**
   * Creates a real, payable Razorpay Payment Link.
   *
   * @param {{
   *   amountRupees: number;
   *   referenceId: string;
   *   description?: string;
   *   notes: { appointment_id: string; clinic_id: string; [key: string]: string };
   * }} opts
   * @returns {Promise<{ id: string; shortUrl: string }>}
   */
  async createPaymentLink({ amountRupees, referenceId, description, notes }) {
    let response;
    try {
      response = await fetch(PAYMENT_LINKS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": this._basicAuthHeader(),
        },
        body: JSON.stringify({
          amount: Math.round(amountRupees * 100), // Razorpay amounts are in paise
          currency: CURRENCY,
          reference_id: referenceId,
          description,
          notes,
          notify: { sms: false, email: false },
          reminder_enable: false,
        }),
      });
    } catch (cause) {
      this._log.error("Razorpay payment link request failed (network)", { referenceId });
      throw new RazorpaySendError("Failed to reach Razorpay API", { cause: String(cause) });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      this._log.error("Razorpay payment link request rejected", {
        referenceId,
        status: response.status,
        error:  payload?.error,
      });
      throw new RazorpaySendError(
        payload?.error?.description ?? `Razorpay API responded with ${response.status}`,
        payload?.error ?? null,
      );
    }

    return { id: payload.id, shortUrl: payload.short_url };
  }

  /**
   * Issues a full refund for a captured Razorpay payment. Omitting `amount`
   * refunds the entire payment (Razorpay default).
   *
   * Idempotency: pass a stable `idempotencyKey` (e.g. appointment id) so a
   * redelivered Cancel webhook does not create a second refund at Razorpay.
   *
   * @param {{
   *   paymentId: string;
   *   idempotencyKey: string;
   *   notes?: Record<string, string>;
   * }} opts
   * @returns {Promise<{ id: string; paymentId: string; amount: number|null; status: string|null }>}
   */
  async createRefund({ paymentId, idempotencyKey, notes }) {
    if (!paymentId) {
      throw new RazorpaySendError("Cannot refund — paymentId is required");
    }
    if (!idempotencyKey) {
      throw new RazorpaySendError("Cannot refund — idempotencyKey is required");
    }

    const url = `${PAYMENTS_URL}/${encodeURIComponent(paymentId)}/refund`;
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": this._basicAuthHeader(),
          "X-Razorpay-Idempotency-Key": String(idempotencyKey),
        },
        body: JSON.stringify({
          ...(notes ? { notes } : {}),
        }),
      });
    } catch (cause) {
      this._log.error("Razorpay refund request failed (network)", { paymentId });
      throw new RazorpaySendError("Failed to reach Razorpay refund API", { cause: String(cause) });
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      this._log.error("Razorpay refund request rejected", {
        paymentId,
        status: response.status,
        error: payload?.error,
      });
      throw new RazorpaySendError(
        payload?.error?.description ?? `Razorpay refund API responded with ${response.status}`,
        payload?.error ?? null,
      );
    }

    return {
      id: payload.id,
      paymentId: payload.payment_id ?? paymentId,
      amount: payload.amount != null ? Number(payload.amount) : null,
      status: payload.status ?? null,
    };
  }
}
