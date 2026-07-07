/**
 * @fileoverview Thin client for the Razorpay Payment Links API. Replaces
 * the Session 3 stub (lib/payment-stub.js, removed) with a real, payable
 * link.
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
    const auth = Buffer.from(`${this._keyId}:${this._keySecret}`).toString("base64");

    let response;
    try {
      response = await fetch(PAYMENT_LINKS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`,
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
}
