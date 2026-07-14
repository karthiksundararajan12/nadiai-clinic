/**
 * @fileoverview DoctorProfileRepository — read-only lookups against
 * public.doctor_profiles needed by the booking bot. Full doctor CRUD lives
 * in other features; this repository only exposes what HUMAN_HANDOFF
 * notifications need.
 */

import { BaseRepository } from "./base.repository.js";

/** @typedef {{ id: string; full_name: string|null; phone: string|null }} NotifiableDoctor */

/**
 * @typedef {Object} SchedulingDoctor
 * @property {string} id
 * @property {string|null} full_name
 * @property {string|null} working_hours_start
 * @property {string|null} working_hours_end
 * @property {number|null} consultation_duration
 * @property {number|null} consultation_fee
 */

export class DoctorProfileRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "doctor_profiles");
  }

  /**
   * Returns every doctor on this clinic with a phone number on file.
   * ARCHITECTURE.md's v1 assumption is one doctor per clinic, but the
   * schema has no constraint enforcing that, so this notifies all of them
   * rather than silently picking one.
   *
   * @param {string} clinicId
   * @returns {Promise<NotifiableDoctor[]>}
   */
  async findNotifiablePhonesByClinicId(clinicId) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("id, full_name, phone")
          .eq("clinic_id", clinicId)
          .not("phone", "is", null),
      "findNotifiablePhonesByClinicId",
    );
  }

  /**
   * The doctor SLOT_SELECTION books against for this clinic. ARCHITECTURE.md's
   * v1 assumption is one doctor per clinic — the schema doesn't enforce
   * that, so this deterministically picks the earliest-created doctor
   * rather than an arbitrary one if a clinic ever ends up with more than
   * one row (multi-doctor clinics/doctor selection are out of scope for v1).
   *
   * @param {string} clinicId
   * @returns {Promise<SchedulingDoctor|null>}
   */
  async findPrimaryByClinicId(clinicId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("id, full_name, working_hours_start, working_hours_end, consultation_duration, consultation_fee")
          .eq("clinic_id", clinicId)
          .order("created_at", { ascending: true })
          .limit(1)
          .single(),
      "findPrimaryByClinicId",
    );
  }

  /**
   * Dashboard settings lookup — scoped to both clinic and auth user so a
   * doctor can only read their own profile row.
   *
   * @param {string} clinicId
   * @param {string} userId
   * @returns {Promise<{ id: string; consultation_fee: number|null }|null>}
   */
  async findByUserId(clinicId, userId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("id, consultation_fee")
          .eq("clinic_id", clinicId)
          .eq("user_id", userId)
          .single(),
      "findByUserId",
    );
  }

  /**
   * @param {string} clinicId
   * @param {string} userId
   * @param {number} consultationFee
   * @returns {Promise<{ consultation_fee: number }>}
   */
  async updateConsultationFee(clinicId, userId, consultationFee) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .update({
            consultation_fee: consultationFee,
            updated_at: new Date().toISOString(),
          })
          .eq("clinic_id", clinicId)
          .eq("user_id", userId)
          .select("consultation_fee")
          .single(),
      "updateConsultationFee",
    );
  }
}
