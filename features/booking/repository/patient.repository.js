/**
 * @fileoverview PatientRepository — data access for public.patients, scoped
 * to the booking bot's needs.
 *
 * Rules:
 *  - Every query is scoped by (clinic_id, contact_phone) or (clinic_id, id)
 *    — never a bare id lookup, to enforce tenant isolation.
 *  - Soft-deleted rows (deleted_at IS NOT NULL) are always excluded.
 */

import { BaseRepository } from "./base.repository.js";
import { DatabaseError } from "../errors.js";

/**
 * @typedef {Object} BookingPatient
 * @property {string} id
 * @property {string} clinic_id
 * @property {string} contact_phone
 * @property {string} full_name
 * @property {string|null} date_of_birth
 * @property {number|null} age_years
 * @property {string|null} gender
 * @property {string|null} relationship_to_contact
 * @property {boolean} consent_given
 * @property {string|null} consent_given_at
 */

export class PatientRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "patients");
  }

  /**
   * All non-deleted patients previously registered under this contact
   * number within this clinic — used to present the "book for" list and
   * as the fuzzy-match candidate pool.
   *
   * @param {string} clinicId
   * @param {string} contactPhone
   * @returns {Promise<BookingPatient[]>}
   */
  async findByContact(clinicId, contactPhone) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("id, clinic_id, contact_phone, full_name, date_of_birth, age_years, gender, relationship_to_contact, consent_given, consent_given_at")
          .eq("clinic_id", clinicId)
          .eq("contact_phone", contactPhone)
          .is("deleted_at", null)
          .order("created_at", { ascending: true }),
      "findByContact",
    );
  }

  /**
   * @param {string} clinicId
   * @param {string} patientId
   * @returns {Promise<BookingPatient|null>}
   */
  async findById(clinicId, patientId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select("id, clinic_id, contact_phone, full_name, date_of_birth, age_years, gender, relationship_to_contact, consent_given, consent_given_at")
          .eq("clinic_id", clinicId)
          .eq("id", patientId)
          .is("deleted_at", null)
          .single(),
      "findById",
    );
  }

  /**
   * Dashboard patient count plus the most recently updated patient records.
   * `updated_at` is the only patient-level activity timestamp in the live
   * schema; appointments are reported separately by AppointmentRepository.
   *
   * All returned rows are "active" under the current schema definition:
   * patients has no active/inactive status column, so non-deleted is the
   * only existing lifecycle distinction.
   *
   * @param {string} clinicId
   * @param {number} [limit]
   * @returns {Promise<{ total: number; recent: Array<{ id: string; full_name: string; updated_at: string }> }>}
   */
  async getDashboardSummary(clinicId, limit = 4) {
    const { data, error, count } = await this._db
      .from(this._table)
      .select("id, full_name, updated_at", { count: "exact" })
      .eq("clinic_id", clinicId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) {
      this._log.error("DB error during getDashboardSummary", {
        operation: "getDashboardSummary",
        table: this._table,
        code: error.code,
        details: error.details,
      });
      throw new DatabaseError("getDashboardSummary", error);
    }

    return { total: count ?? 0, recent: data ?? [] };
  }

  /**
   * Patient options for authenticated clinic workflows such as manual
   * appointment creation. Paginated internally to avoid PostgREST row caps.
   */
  async findAllForClinic(clinicId) {
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
            .select("id, full_name, contact_phone")
            .eq("clinic_id", clinicId)
            .is("deleted_at", null)
            .order("full_name", { ascending: true })
            .range(from, to),
        "findAllForClinic",
      );
      all.push(...rows);
      hasMore = rows.length === PAGE_SIZE;
      page += 1;
    }

    return all;
  }

  /**
   * @param {{
   *   clinic_id: string;
   *   contact_phone: string;
   *   full_name: string;
   *   age_years?: number|null;
   *   date_of_birth?: string|null;
   *   relationship_to_contact?: string;
   * }} data
   * @returns {Promise<BookingPatient>}
   */
  async create(data) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .insert({
            relationship_to_contact: "self",
            ...data,
            consent_given: true,
            consent_given_at: new Date().toISOString(),
          })
          .select("*")
          .single(),
      "create",
    );
  }

  /**
   * Back-fills consent on a patient created before consent capture existed
   * (defensive — the booking bot always captures consent on create, but a
   * patient could have been added through another channel).
   *
   * @param {string} clinicId
   * @param {string} patientId
   * @returns {Promise<BookingPatient>}
   */
  async recordConsent(clinicId, patientId) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .update({ consent_given: true, consent_given_at: new Date().toISOString() })
          .eq("clinic_id", clinicId)
          .eq("id", patientId)
          .select("*")
          .single(),
      "recordConsent",
    );
  }
}
