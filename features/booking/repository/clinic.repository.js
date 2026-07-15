/**
 * @fileoverview ClinicRepository — read-only lookups against public.clinics
 * needed by the booking bot. Full clinic CRUD lives in the onboarding
 * feature; this repository only exposes what the webhook layer needs to
 * resolve multi-tenant routing.
 */

import { BaseRepository } from "./base.repository.js";

/** @typedef {{ id: string; name: string; whatsapp_phone_number_id: string|null; whatsapp_setup_status: string|null; address: string|null; phone: string|null }} BookingClinic */

export class ClinicRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "clinics");
  }

  /**
   * Resolves the clinic that owns a given Meta phone_number_id.
   * This is the multi-tenant routing entry point: every webhook request
   * resolves clinic_id exactly once here, then threads it through every
   * subsequent query.
   *
   * @param {string} phoneNumberId
   * @returns {Promise<BookingClinic|null>}
   */
  async findByWhatsAppPhoneNumberId(phoneNumberId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("id, name, whatsapp_phone_number_id, whatsapp_setup_status, address, phone")
          .eq("whatsapp_phone_number_id", phoneNumberId)
          .single(),
      "findByWhatsAppPhoneNumberId",
    );
  }

  /**
   * Used by PaymentWebhookService, which only has `clinic_id` (from the
   * Razorpay payment's `notes`, not an inbound WhatsApp message) and needs
   * `whatsapp_phone_number_id` to notify the contact.
   *
   * @param {string} clinicId
   * @returns {Promise<BookingClinic|null>}
   */
  async findById(clinicId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("id, name, whatsapp_phone_number_id, whatsapp_setup_status, address, phone")
          .eq("id", clinicId)
          .single(),
      "findById",
    );
  }

  /**
   * Every clinic with WhatsApp routing configured, plus its reminder
   * offsets — used by ReminderService to loop clinic-by-clinic (see that
   * file's header comment on why the reminder cron is a per-clinic loop
   * rather than one global query: PostgREST can't express "compare
   * slot_start to now() + this row's own offset column" in a single
   * request, and looping keeps every query scoped by clinic_id like
   * everywhere else in this codebase). Flagged scale trade-off: at the
   * project's target 5k-clinic scale this becomes 5k small queries per
   * cron tick — acceptable for the current pre-launch testing phase, but
   * worth revisiting (e.g. a Postgres function/view) before then.
   *
   * Paginated internally (PAGE_SIZE) since PostgREST caps unbounded
   * selects — safe to call with an arbitrarily large clinics table.
   *
   * @returns {Promise<Array<{ id: string; name: string; whatsapp_phone_number_id: string; reminder_24h_offset_minutes: number; reminder_2h_offset_minutes: number }>>}
   */
  async findAllWithWhatsAppConfigured() {
    const PAGE_SIZE = 500;
    const all = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const rows = await this._run(
        () =>
          this._db
            .from(this._table)
            .select("id, name, whatsapp_phone_number_id, reminder_24h_offset_minutes, reminder_2h_offset_minutes")
            .not("whatsapp_phone_number_id", "is", null)
            .order("id", { ascending: true })
            .range(from, to),
        "findAllWithWhatsAppConfigured",
      );
      all.push(...rows);
      hasMore = rows.length === PAGE_SIZE;
      page += 1;
    }

    return all;
  }

  async updateById(clinicId, { name, phone, address }) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .update({
            name,
            phone,
            address,
          })
          .eq("id", clinicId)
          .select("id, name, phone, address")
          .single(),
      "updateById",
    );
  }
}
