/**
 * @fileoverview WhatsAppInboundMessageRepository — idempotency ledger for
 * inbound WhatsApp webhook deliveries (public.whatsapp_inbound_messages,
 * migration 20260922090000).
 *
 * Meta redelivers an inbound message webhook whenever it doesn't get a
 * prompt 2xx, and occasionally redelivers regardless. Every delivery's
 * wamid (`messages[].id`) is recorded here exactly once via insert-if-new:
 * a UNIQUE violation on wa_message_id means "already processed", not an
 * error, so the webhook route can no-op on replay instead of re-running
 * the message's side effects.
 *
 * This replaces `conversation_state.context.last_wa_message_id` as the
 * authoritative dedupe: that field only remembers ONE wamid per contact, so
 * a redelivery arriving after any other message from the same contact was
 * indistinguishable from a new message. It is still written, for debugging
 * and as a cheap in-row second layer.
 */

import { DatabaseError } from "../errors.js";
import { BaseRepository } from "./base.repository.js";

const UNIQUE_VIOLATION_CODE = "23505";

export class WhatsAppInboundMessageRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "whatsapp_inbound_messages");
  }

  /**
   * @param {string} waMessageId  Meta's `messages[].id` (wamid).
   * @param {{ phoneNumberId?: string|null; contactPhone?: string|null; clinicId?: string|null }} [meta]
   * @returns {Promise<boolean>} true the first time this wamid is seen
   *   (caller should process it); false on a redelivery (caller should no-op).
   */
  async recordIfNew(waMessageId, { phoneNumberId = null, contactPhone = null, clinicId = null } = {}) {
    const { error } = await this._db.from(this._table).insert({
      wa_message_id:   waMessageId,
      phone_number_id: phoneNumberId,
      contact_phone:   contactPhone,
      clinic_id:       clinicId,
    });

    if (!error) return true;

    if (error.code === UNIQUE_VIOLATION_CODE) {
      this._log.info("Inbound WhatsApp message already processed — skipping redelivery", { waMessageId });
      return false;
    }

    this._log.error("DB error recording inbound WhatsApp message", {
      waMessageId,
      code: error.code,
    });
    throw new DatabaseError("recordIfNew", error);
  }
}
