/**
 * @fileoverview ConversationStateRepository — data access for
 * public.conversation_state.
 *
 * Rules:
 *  - NO business logic here (expiry checks, transition validation, message
 *    dispatch all live in the service layer).
 *  - Every query is scoped by (clinic_id, contact_phone) — this table's
 *    only unique key — never by patient_id (there is often no patient yet).
 *  - `context` (jsonb) doubles as our idempotency ledger: we stash the
 *    last processed `wa_message_id` there since no separate inbound
 *    message log table exists yet (see features/booking/index.js header
 *    note on this trade-off).
 */

import { BaseRepository } from "./base.repository.js";

/**
 * @typedef {Object} ConversationStateRow
 * @property {string} id
 * @property {string} clinic_id
 * @property {string} contact_phone
 * @property {string} current_state
 * @property {Record<string, unknown>} context
 * @property {string} last_message_at
 * @property {number} retry_count
 * @property {string} created_at
 * @property {string} updated_at
 */

export class ConversationStateRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "conversation_state");
  }

  /**
   * @param {string} clinicId
   * @param {string} contactPhone
   * @returns {Promise<ConversationStateRow|null>}
   */
  async find(clinicId, contactPhone) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("contact_phone", contactPhone)
          .single(),
      "find",
    );
  }

  /**
   * Creates the row for a brand-new contact, or resets an expired one back
   * to START. Relies on the UNIQUE (clinic_id, contact_phone) index for
   * upsert semantics — safe to call even if a stale row exists.
   *
   * @param {string} clinicId
   * @param {string} contactPhone
   * @param {{ currentState: string; context?: Record<string, unknown> }} init
   * @returns {Promise<ConversationStateRow>}
   */
  async upsertToState(clinicId, contactPhone, { currentState, context = {} }) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .upsert(
            {
              clinic_id:       clinicId,
              contact_phone:   contactPhone,
              current_state:   currentState,
              context,
              retry_count:     0,
              last_message_at: new Date().toISOString(),
            },
            { onConflict: "clinic_id,contact_phone" },
          )
          .select("*")
          .single(),
      "upsertToState",
    );
  }

  /**
   * Partial update by id. Used for in-place mutations (retry_count bumps,
   * context merges, state transitions) once a row is already loaded.
   *
   * @param {string} id
   * @param {Partial<Pick<ConversationStateRow, "current_state"|"context"|"retry_count"|"last_message_at">>} updates
   * @returns {Promise<ConversationStateRow>}
   */
  async update(id, updates) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .update(updates)
          .eq("id", id)
          .select("*")
          .single(),
      "update",
    );
  }
}
