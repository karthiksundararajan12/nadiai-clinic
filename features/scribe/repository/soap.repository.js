/**
 * @fileoverview SOAPRepository — persistence and context assembly for
 * SOAP note generation.
 */

import { BaseRepository } from "./base.repository.js";

export class SOAPRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "soap_notes");
  }

  /** @param {string} sessionId */
  async getGenerationContext(sessionId) {
    const session = await this._runNullable(
      () =>
        this._db
          .from("scribe_sessions")
          .select("*")
          .eq("id", sessionId)
          .is("deleted_at", null)
          .single(),
      "getSoapSession",
    );
    if (!session) return null;

    const [patient, doctor, appointment, latestTranscriptVersion, segments] = await Promise.all([
      session.patient_id ? this._getPatient(session.patient_id, session.doctor_id) : null,
      this._getDoctor(session.doctor_id),
      session.appointment_id ? this._getAppointment(session.appointment_id, session.doctor_id) : null,
      this.getLatestTranscriptVersion(sessionId),
      this._getTranscriptSegments(sessionId),
    ]);

    return { session, patient, doctor, appointment, latestTranscriptVersion, segments };
  }

  /** @param {string} patientId @param {string} doctorId */
  async _getPatient(patientId, doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from("patients")
          .select("id, name, age, gender, condition, status, last_visit")
          .eq("id", patientId)
          .eq("doctor_id", doctorId)
          .single(),
      "getSoapPatient",
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
      "getSoapDoctor",
    );
  }

  /** @param {string} appointmentId @param {string} doctorId */
  async _getAppointment(appointmentId, doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from("appointments")
          .select("id, patient_name, date, time, type, status, notes")
          .eq("id", appointmentId)
          .eq("doctor_id", doctorId)
          .single(),
      "getSoapAppointment",
    );
  }

  /** @param {string} sessionId */
  async _getTranscriptSegments(sessionId) {
    return this._run(
      () =>
        this._db
          .from("transcription_segments")
          .select("id, segment_index, start_seconds, end_seconds, text, speaker_label, is_low_confidence")
          .eq("session_id", sessionId)
          .order("segment_index", { ascending: true }),
      "getSoapTranscriptSegments",
    );
  }

  /** @param {string} sessionId */
  async getLatestTranscriptVersion(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from("transcript_versions")
          .select("*")
          .eq("session_id", sessionId)
          .order("version_number", { ascending: false })
          .limit(1)
          .single(),
      "getLatestTranscriptVersionForSoap",
    );
  }

  /** @param {string} versionId */
  async getTranscriptVersion(versionId) {
    return this._runNullable(
      () =>
        this._db
          .from("transcript_versions")
          .select("*")
          .eq("id", versionId)
          .single(),
      "getTranscriptVersionForSoap",
    );
  }

  /**
   * @param {string} sessionId
   * @param {string} inputHash
   */
  async findReusableNote(sessionId, inputHash) {
    return this._runNullable(
      () =>
        this._db
          .from("soap_notes")
          .select("*")
          .eq("session_id", sessionId)
          .eq("input_hash", inputHash)
          .in("status", ["ready", "review_required", "approved"])
          .single(),
      "findReusableSoapNote",
    );
  }

  /** @param {Record<string, unknown>} data */
  async upsertNote(data) {
    return this._run(
      () =>
        this._db
          .from("soap_notes")
          .upsert(data, { onConflict: "session_id" })
          .select("*")
          .single(),
      "upsertSoapNote",
    );
  }

  /** @param {string} sessionId */
  async getNoteBySession(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from("soap_notes")
          .select("*")
          .eq("session_id", sessionId)
          .single(),
      "getSoapNoteBySession",
    );
  }

  /**
   * @param {string} noteId
   * @param {Record<string, unknown>} updates
   */
  async updateNote(noteId, updates) {
    return this._run(
      () =>
        this._db
          .from("soap_notes")
          .update(updates)
          .eq("id", noteId)
          .select("*")
          .single(),
      "updateSoapNote",
    );
  }

  /** @param {string} soapNoteId */
  async getNextVersionNumber(soapNoteId) {
    const latest = await this._runNullable(
      () =>
        this._db
          .from("soap_note_versions")
          .select("version_number")
          .eq("soap_note_id", soapNoteId)
          .order("version_number", { ascending: false })
          .limit(1)
          .single(),
      "getNextSoapVersionNumber",
    );
    return (latest?.version_number ?? 0) + 1;
  }

  /** @param {Record<string, unknown>} data */
  async createVersion(data) {
    return this._run(
      () =>
        this._db
          .from("soap_note_versions")
          .insert(data)
          .select("*")
          .single(),
      "createSoapNoteVersion",
    );
  }

  /** @param {string} sessionId */
  async getVersions(sessionId) {
    return this._run(
      () =>
        this._db
          .from("soap_note_versions")
          .select("*")
          .eq("session_id", sessionId)
          .order("version_number", { ascending: false }),
      "getSoapNoteVersions",
    );
  }

  /** @param {string} versionId */
  async getVersion(versionId) {
    return this._runNullable(
      () =>
        this._db
          .from("soap_note_versions")
          .select("*")
          .eq("id", versionId)
          .single(),
      "getSoapNoteVersion",
    );
  }

  /** @param {Record<string, unknown>} edit */
  async insertEdit(edit) {
    return this._run(
      () =>
        this._db
          .from("soap_note_edits")
          .insert(edit)
          .select("*")
          .single(),
      "insertSoapNoteEdit",
    );
  }

  /** @param {string} sessionId */
  async getEdits(sessionId) {
    return this._run(
      () =>
        this._db
          .from("soap_note_edits")
          .select("*")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: false }),
      "getSoapNoteEdits",
    );
  }
}
