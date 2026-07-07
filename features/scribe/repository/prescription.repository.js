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

export class PrescriptionRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "prescription_drafts");
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

    const [soapNote, patient, doctor, appointment, latestTranscriptVersion] =
      await Promise.all([
        this._getApprovedSoapNote(sessionId),
        session.patient_id ? this._getPatient(session.patient_id, session.doctor_id) : null,
        this._getDoctor(session.doctor_id),
        session.appointment_id
          ? this._getAppointment(session.appointment_id, session.doctor_id)
          : null,
        this._getLatestTranscriptVersion(sessionId),
      ]);

    return { session, soapNote, patient, doctor, appointment, latestTranscriptVersion };
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
   * @param {string} doctorId
   */
  async _getPatient(patientId, doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from("patients")
          .select("id, name, age, gender, condition, status, last_visit")
          .eq("id", patientId)
          .eq("doctor_id", doctorId)
          .single(),
      "getPrescriptionPatient",
    );
  }

  /** @param {string} doctorId */
  async _getDoctor(doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from("doctor_profiles")
          .select("user_id, full_name, specialization, clinic_name, clinic_address")
          .eq("user_id", doctorId)
          .single(),
      "getPrescriptionDoctor",
    );
  }

  /**
   * @param {string} appointmentId
   * @param {string} doctorId
   */
  async _getAppointment(appointmentId, doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from("appointments")
          .select("id, patient_name, date, time, type, status, notes")
          .eq("id", appointmentId)
          .eq("doctor_id", doctorId)
          .single(),
      "getPrescriptionAppointment",
    );
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
