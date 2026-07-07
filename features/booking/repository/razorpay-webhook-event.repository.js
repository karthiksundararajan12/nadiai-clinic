/**
 * @fileoverview RazorpayWebhookEventRepository — idempotency ledger for
 * Razorpay webhook deliveries (public.razorpay_webhook_events, migration
 * 020). Razorpay redelivers a webhook on anything but a prompt 2xx (and
 * occasionally regardless) — every delivery's `X-Razorpay-Event-Id` is
 * recorded here exactly once via insert-if-new: a UNIQUE violation on
 * event_id means "already processed", not an error, so PaymentWebhookService
 * can no-op on replay instead of re-running a transition.
 */

import { DatabaseError } from "../errors.js";
import { BaseRepository } from "./base.repository.js";

const UNIQUE_VIOLATION_CODE = "23505";

export class RazorpayWebhookEventRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "razorpay_webhook_events");
  }

  /**
   * @param {string} eventId    The X-Razorpay-Event-Id header value.
   * @param {string} eventType  Razorpay's `event` field (e.g. "payment.captured").
   * @param {unknown} payload   Full webhook body, stored for audit/debugging.
   * @returns {Promise<boolean>} true the first time this event id is seen
   *   (caller should process it); false on a replay (caller should no-op).
   */
  async recordIfNew(eventId, eventType, payload) {
    const { error } = await this._db
      .from(this._table)
      .insert({ event_id: eventId, event_type: eventType, payload: payload ?? null });

    if (!error) return true;

    if (error.code === UNIQUE_VIOLATION_CODE) {
      this._log.info("Razorpay webhook event already processed — skipping replay", { eventId, eventType });
      return false;
    }

    this._log.error("DB error recording Razorpay webhook event", {
      eventId,
      eventType,
      code: error.code,
    });
    throw new DatabaseError("recordIfNew", error);
  }
}
