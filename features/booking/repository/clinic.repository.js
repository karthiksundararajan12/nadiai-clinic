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
}
