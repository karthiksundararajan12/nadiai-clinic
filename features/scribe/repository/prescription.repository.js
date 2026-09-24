/**
 * @fileoverview PrescriptionRepository — persistence layer for prescription drafts,
 * version snapshots, and the context assembly needed for generation.
 *
 * Follows the same conventions as SOAPRepository:
 *  - No business logic — only data access.
 *  - All multi-tenant queries include clinic_id / doctor_id guards.
 *  - Idempotent upsert on session_id for the current draft.
 */

import { BaseRepository } from "./base.repository.js";
import { DatabaseError } from "../errors.js";
import { formatPrescriptionNumber } from "../lib/prescription-number.js";

export class PrescriptionRepository extends BaseRepository {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {import("@supabase/supabase-js").SupabaseClient} [adminDb]
   *   Optional service-role client for RPCs granted only to service_role
   *   (e.g. next_prescription_number).
   */
  constructor(supabase, adminDb = null) {
    super(supabase, "prescription_drafts");
    this._adminDb = adminDb;
  }

  // ─────────────────────────────────────────────────────────────
  // CONTEXT ASSEMBLY
  // ─────────────────────────────────────────────────────────────

  /**
   * Assembles everything the service needs to generate a prescription draft:
   * the session, the approved SOAP note, the latest transcript, and the
   * patient/doctor/appointment context.
   *
   * @param {string} sessionId
   * @returns {Promise<PrescriptionGenerationContext|null>}
   */
  async getGenerationContext(sessionId) {
    const session = await this._runNullable(
      () =>
        this._db
          .from("scribe_sessions")
          .select("*")
          .eq("id", sessionId)
          .is("deleted_at", null)
          .single(),
      "getPrescriptionSession",
    );
    if (!session) return null;

    const [soapNote, patient, doctor, appointment, latestTranscriptVersion, latestWeightKg] =
      await Promise.all([
        this._getApprovedSoapNote(sessionId),
        session.patient_id
          ? this._getPatient(session.patient_id, session.clinic_id)
          : null,
        this._getDoctor(session.doctor_id),
        session.appointment_id
          ? this._getAppointment(session.appointment_id, session.doctor_id)
          : null,
        this._getLatestTranscriptVersion(sessionId),
        session.patient_id
          ? this._getLatestWeightKg(session.patient_id, session.clinic_id)
          : null,
      ]);

    return {
      session,
      soapNote,
      patient,
      doctor,
      appointment,
      latestTranscriptVersion,
      latestWeightKg,
    };
  }

  /** @param {string} sessionId */
  async _getApprovedSoapNote(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from("soap_notes")
          .select(
            "id, session_id, status, note, subjective, objective, assessment, plan, " +
            "chief_complaint, history_of_present_illness, clinical_summary, " +
            "provider, model, prompt_version, generated_at",
          )
          .eq("session_id", sessionId)
          .single(),
      "getPrescriptionSoapNote",
    );
  }

  /**
   * @param {string} patientId
   * @param {string} clinicId
   * @returns {Promise<{
   *   id: string;
   *   name: string;
   *   age: number|null;
   *   gender: string|null;
   *   phone: string|null;
   *   condition: null;
   *   status: null;
   *   last_visit: null;
   *   date_of_birth_is_approximate: boolean;
   * }|null>}
   */
  async _getPatient(patientId, clinicId) {
    return this._runNullable(
      () =>
        this._db
          .from("patients")
          .select(
            "id, full_name, age_years, date_of_birth, date_of_birth_is_approximate, gender, contact_phone",
          )
          .eq("id", patientId)
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .single(),
      "getPrescriptionPatient",
    ).then((row) =>
      row
        ? {
            id: row.id,
            name: row.full_name,
            age: row.age_years ?? null,
            date_of_birth: row.date_of_birth ?? null,
            date_of_birth_is_approximate: row.date_of_birth_is_approximate ?? false,
            gender: row.gender ?? null,
            phone: row.contact_phone ?? null,
            // Legacy prompt/UI fields — not present on clinic-scoped patients.
            condition: null,
            status: null,
            last_visit: null,
          }
        : null,
    );
  }

  /**
   * Latest recorded weight from public.vitals (fallback when SOAP Objective
   * has no Weight: line).
   *
   * @param {string} patientId
   * @param {string} clinicId
   * @returns {Promise<number|null>}
   */
  async _getLatestWeightKg(patientId, clinicId) {
    const row = await this._runNullable(
      () =>
        this._db
          .from("vitals")
          .select("weight_kg")
          .eq("patient_id", patientId)
          .eq("clinic_id", clinicId)
          .not("weight_kg", "is", null)
          .order("recorded_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      "getPrescriptionLatestWeight",
    );
    const value = Number(row?.weight_kg);
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  /** @param {string} doctorId auth user id (doctor_profiles.user_id) */
  async _getDoctor(doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from("doctor_profiles")
          .select(
            "user_id, full_name, specialization, qualifications, clinic_name, clinic_address, license_number",
          )
          .eq("user_id", doctorId)
          .single(),
      "getPrescriptionDoctor",
    );
  }

  /**
   * Doctor identity for prescription export / review workspace.
   * @param {string} doctorId auth user id
   */
  async getDoctorProfile(doctorId) {
    return this._getDoctor(doctorId);
  }

  /**
   * Clinic-scoped appointments use slot_start/slot_end (not legacy date/time/type/notes/patient_name).
   * @param {string} appointmentId
   * @param {string} doctorId
   */
  async _getAppointment(appointmentId, doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from("appointments")
          .select("id, patient_id, slot_start, slot_end, status")
          .eq("id", appointmentId)
          .eq("doctor_id", doctorId)
          .is("deleted_at", null)
          .single(),
      "getPrescriptionAppointment",
    ).then((row) => (row ? mapClinicAppointment(row) : null));
  }

  /** @param {string} sessionId */
  async _getLatestTranscriptVersion(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from("transcript_versions")
          .select("id, session_id, version_number, full_text, label, created_at")
          .eq("session_id", sessionId)
          .order("version_number", { ascending: false })
          .limit(1)
          .single(),
      "getPrescriptionTranscriptVersion",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // DRAFT CRUD
  // ─────────────────────────────────────────────────────────────

  /**
   * Creates or replaces the current draft for a session (one row per session).
   *
   * @param {Record<string, unknown>} data
   */
  async upsertDraft(data) {
    return this._run(
      () =>
        this._db
          .from("prescription_drafts")
          .upsert(data, { onConflict: "session_id" })
          .select("*")
          .single(),
      "upsertPrescriptionDraft",
    );
  }

  /** @param {string} sessionId */
  async getDraftBySession(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from("prescription_drafts")
          .select("*")
          .eq("session_id", sessionId)
          .single(),
      "getPrescriptionDraftBySession",
    );
  }

  /**
   * Checks whether an equivalent (same input hash) draft already exists and
   * is in a usable state — avoids re-generating when nothing has changed.
   *
   * @param {string} sessionId
   * @param {string} inputHash
   */
  async findReusableDraft(sessionId, inputHash) {
    return this._runNullable(
      () =>
        this._db
          .from("prescription_drafts")
          .select("*")
          .eq("session_id", sessionId)
          .eq("input_hash", inputHash)
          .eq("status", "draft_ready")
          .single(),
      "findReusablePrescriptionDraft",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // VERSION HISTORY
  // ─────────────────────────────────────────────────────────────

  /** @param {string} draftId */
  async getNextVersionNumber(draftId) {
    const latest = await this._runNullable(
      () =>
        this._db
          .from("prescription_draft_versions")
          .select("version_number")
          .eq("prescription_draft_id", draftId)
          .order("version_number", { ascending: false })
          .limit(1)
          .single(),
      "getNextPrescriptionVersionNumber",
    );
    return (latest?.version_number ?? 0) + 1;
  }

  /** @param {Record<string, unknown>} data */
  async createVersion(data) {
    return this._run(
      () =>
        this._db
          .from("prescription_draft_versions")
          .insert(data)
          .select("*")
          .single(),
      "createPrescriptionDraftVersion",
    );
  }

  /** @param {string} sessionId */
  async getVersions(sessionId) {
    return this._run(
      () =>
        this._db
          .from("prescription_draft_versions")
          .select("*")
          .eq("session_id", sessionId)
          .order("version_number", { ascending: false }),
      "getPrescriptionDraftVersions",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // DRAFT FIELD UPDATES
  // ─────────────────────────────────────────────────────────────

  /**
   * Partial update on the draft row (does not upsert).
   *
   * @param {string}                 draftId
   * @param {Record<string,unknown>} updates
   */
  async updateDraftFields(draftId, updates) {
    return this._run(
      () =>
        this._db
          .from("prescription_drafts")
          .update(updates)
          .eq("id", draftId)
          .select("*")
          .single(),
      "updatePrescriptionDraftFields",
    );
  }

  /**
   * Atomically allocates the next sequential Rx number for a clinic via
   * `next_prescription_number` (migration 20260807043652). Uses the
   * service-role client when available (RPC is granted only to service_role).
   *
   * @param {string} clinicId
   * @returns {Promise<{ prescriptionSeq: number; prescriptionNumber: string }>}
   */
  async allocateNextNumber(clinicId) {
    const db = this._adminDb ?? this._db;
    const { data, error } = await db.rpc("next_prescription_number", {
      p_clinic_id: clinicId,
    });
    if (error) {
      this._log.error("DB error during allocateNextNumber", {
        operation: "allocateNextNumber",
        table: "prescription_counters",
        code: error.code,
      });
      throw new DatabaseError("allocateNextNumber", error);
    }
    const prescriptionSeq = Number(data);
    return {
      prescriptionSeq,
      prescriptionNumber: formatPrescriptionNumber(prescriptionSeq),
    };
  }

  /**
   * @param {string} clinicId
   * @returns {Promise<string|null>}
   */
  async getClinicPhone(clinicId) {
    const row = await this.getClinicLetterhead(clinicId);
    return row?.phone ? String(row.phone) : null;
  }

  /**
   * Clinic name, address, and phone for the prescription letterhead.
   * @param {string} clinicId
   * @returns {Promise<{ name: string|null; address: string|null; phone: string|null }|null>}
   */
  async getClinicLetterhead(clinicId) {
    const db = this._adminDb ?? this._db;
    const row = await this._runNullable(
      () =>
        db
          .from("clinics")
          .select("name, address, phone")
          .eq("id", clinicId)
          .single(),
      "getClinicLetterhead",
    );
    if (!row) return null;
    return {
      name: row.name ? String(row.name) : null,
      address: row.address ? String(row.address) : null,
      phone: row.phone ? String(row.phone) : null,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PRESCRIPTION REVIEWS
  // ─────────────────────────────────────────────────────────────

  /** @param {Record<string,unknown>} data */
  async createReview(data) {
    return this._run(
      () =>
        this._db
          .from("prescription_reviews")
          .insert(data)
          .select("*")
          .single(),
      "createPrescriptionReview",
    );
  }

  /** @param {string} draftId */
  async getReviewByDraft(draftId) {
    return this._runNullable(
      () =>
        this._db
          .from("prescription_reviews")
          .select("*")
          .eq("prescription_draft_id", draftId)
          .single(),
      "getPrescriptionReviewByDraft",
    );
  }

  /**
   * @param {string}                 reviewId
   * @param {Record<string,unknown>} updates
   */
  async updateReview(reviewId, updates) {
    return this._run(
      () =>
        this._db
          .from("prescription_reviews")
          .update(updates)
          .eq("id", reviewId)
          .select("*")
          .single(),
      "updatePrescriptionReview",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // REVIEW EVENTS (AUDIT TRAIL)
  // ─────────────────────────────────────────────────────────────

  /** @param {Record<string,unknown>} event */
  async insertReviewEvent(event) {
    return this._run(
      () =>
        this._db
          .from("prescription_review_events")
          .insert(event)
          .select("*")
          .single(),
      "insertPrescriptionReviewEvent",
    );
  }

  /**
   * Returns the most recent approved prescription drafts for a doctor (style learning).
   *
   * @param {string} doctorId
   * @param {number} [limit]
   */
  async getApprovedPrescriptionsForDoctor(doctorId, limit = 20) {
    return this._run(
      () =>
        this._db
          .from("prescription_drafts")
          .select("id, draft, approved_at, session_id")
          .eq("doctor_id", doctorId)
          .eq("status", "approved")
          .order("approved_at", { ascending: false })
          .limit(limit),
      "getApprovedPrescriptionsForDoctor",
    );
  }

  /** @param {string} sessionId */
  async getReviewEvents(sessionId) {
    return this._run(
      () =>
        this._db
          .from("prescription_review_events")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false }),
      "getPrescriptionReviewEvents",
    );
  }
}

/**
 * @typedef {Object} PrescriptionGenerationContext
 * @property {Record<string,unknown>}      session
 * @property {Record<string,unknown>|null} soapNote
 * @property {Record<string,unknown>|null} patient
 * @property {Record<string,unknown>|null} doctor
 * @property {Record<string,unknown>|null} appointment
 * @property {Record<string,unknown>|null} latestTranscriptVersion
 */

/**
 * @param {{
 *   id: string;
 *   patient_id?: string|null;
 *   slot_start?: string|null;
 *   slot_end?: string|null;
 *   status?: string|null;
 * }} row
 */
function mapClinicAppointment(row) {
  const slotStart = row.slot_start ? String(row.slot_start) : null;
  return {
    id: row.id,
    patient_id: row.patient_id ?? null,
    patient_name: null,
    date: slotStart ? slotStart.slice(0, 10) : null,
    time: slotStart && slotStart.length >= 16 ? slotStart.slice(11, 16) : null,
    type: null,
    status: row.status ?? null,
    notes: null,
    slot_start: row.slot_start ?? null,
    slot_end: row.slot_end ?? null,
  };
}
