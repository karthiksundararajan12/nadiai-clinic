/**
 * @fileoverview SessionRepository — data access layer for scribe_sessions,
 * scribe_audio_chunks, and scribe_processing_queue.
 *
 * Rules:
 *  - NO business logic here. Call service layer for validation.
 *  - All queries include doctor_id / clinic_id guards so a compromised
 *    admin token cannot read across tenants accidentally.
 *  - State transitions use optimistic concurrency (check fromStatus
 *    in the WHERE clause) to prevent races in multi-worker scenarios.
 */

import { BaseRepository }      from "./base.repository.js";
import { SessionNotFoundError } from "../errors.js";
import { SESSION_STATUS }       from "../constants.js";

/** @typedef {import("../models/session.model.js").ScribeSession}       ScribeSession */
/** @typedef {import("../models/session.model.js").ScribeAudioChunk}    ScribeAudioChunk */
/** @typedef {import("../models/session.model.js").ProcessingQueueJob}  ProcessingQueueJob */
/** @typedef {import("../models/session.model.js").PaginatedResult}     PaginatedResult */
/** @typedef {import("../schemas.js").SessionFilterInput}               SessionFilterInput */

/** Columns returned in list queries — excludes heavy JSONB blobs. */
const SESSION_LIST_SELECT = [
  "id",
  "doctor_id",
  "clinic_id",
  "patient_id",
  "appointment_id",
  "language",
  "status",
  "upload_progress",
  "audio_duration_seconds",
  "audio_size_bytes",
  "audio_confirmed_chunks",
  "audio_total_chunks",
  "error_message",
  "is_finalized",
  "signed_at",
  "deleted_at",
  "created_at",
  "updated_at",
].join(", ");

/** Columns returned in detail queries — includes transcript JSON. */
const SESSION_DETAIL_SELECT = SESSION_LIST_SELECT + [
  "",
  "audio_storage_prefix",
  "edited_transcript",
  "speaker_corrections",
  "reviewed_at",
].join(", ");

export class SessionRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "scribe_sessions");
  }

  // ─────────────────────────────────────────────────────────────
  // CREATE
  // ─────────────────────────────────────────────────────────────

  /**
   * Inserts a new scribe session row.
   *
   * @param {{
   *   doctor_id:       string;
   *   clinic_id:       string;
   *   patient_id?:     string|null;
   *   appointment_id?: string|null;
   *   language?:       string;
   *   audio_storage_prefix: string;
   * }} data
   * @returns {Promise<ScribeSession>}
   */
  async create(data) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .insert({
            ...data,
            status:                 SESSION_STATUS.CREATED,
            upload_progress:        0,
            audio_confirmed_chunks: 0,
            is_finalized:           false,
          })
          .select(SESSION_DETAIL_SELECT)
          .single(),
      "create",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // READ
  // ─────────────────────────────────────────────────────────────

  /**
   * Fetches a session by ID, scoped to doctor.
   * Returns null when not found or access is denied.
   *
   * @param {string} sessionId
   * @param {string} doctorId
   * @returns {Promise<ScribeSession|null>}
   */
  async findById(sessionId, doctorId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select(SESSION_DETAIL_SELECT)
          .eq("id",        sessionId)
          .eq("doctor_id", doctorId)
          .is("deleted_at", null)
          .single(),
      "findById",
    );
  }

  /**
   * Fetches a session by ID for clinic-level access (admin/export use cases).
   *
   * @param {string} sessionId
   * @param {string} clinicId
   * @returns {Promise<ScribeSession|null>}
   */
  async findByIdForClinic(sessionId, clinicId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select(SESSION_DETAIL_SELECT)
          .eq("id",        sessionId)
          .eq("clinic_id", clinicId)
          .is("deleted_at", null)
          .single(),
      "findByIdForClinic",
    );
  }

  /**
   * Fetches a session by ID for trusted background workers.
   * This uses the service-role client, but still excludes soft-deleted rows.
   *
   * @param {string} sessionId
   * @returns {Promise<ScribeSession|null>}
   */
  async findByIdForWorker(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from(this._table)
          .select(SESSION_DETAIL_SELECT)
          .eq("id", sessionId)
          .is("deleted_at", null)
          .single(),
      "findByIdForWorker",
    );
  }

  /**
   * Paginated list of sessions for a doctor.
   *
   * @param {string}              doctorId
   * @param {SessionFilterInput}  filters
   * @returns {Promise<PaginatedResult<ScribeSession>>}
   */
  async findMany(doctorId, filters) {
    const {
      patient_id,
      status,
      language,
      date_from,
      date_to,
      page    = 1,
      limit   = 20,
      sort_by    = "created_at",
      sort_order = "desc",
    } = filters;

    const offset = (page - 1) * limit;

    let query = this._db
      .from(this._table)
      .select(SESSION_LIST_SELECT, { count: "exact" })
      .eq("doctor_id", doctorId)
      .is("deleted_at", null)
      .order(sort_by, { ascending: sort_order === "asc" })
      .range(offset, offset + limit - 1);

    if (patient_id)  query = query.eq("patient_id", patient_id);
    if (language)    query = query.eq("language",   language);
    if (date_from)   query = query.gte("created_at", date_from);
    if (date_to)     query = query.lte("created_at", date_to);

    if (status?.length) {
      query = status.length === 1
        ? query.eq("status", status[0])
        : query.in("status", status);
    }

    const { data, error, count } = await query;

    if (error) throw new Error(`findMany failed: ${error.message}`);

    const total      = count ?? 0;
    const totalPages = Math.ceil(total / limit);

    return {
      data:       data ?? [],
      total,
      page,
      limit,
      totalPages,
      hasMore: page < totalPages,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE
  // ─────────────────────────────────────────────────────────────

  /**
   * Partial update on a session. Doctor ownership is enforced in the WHERE clause.
   *
   * @param {string}                     sessionId
   * @param {string}                     doctorId
   * @param {Partial<ScribeSession>}     updates
   * @returns {Promise<ScribeSession>}
   */
  async update(sessionId, doctorId, updates) {
    const result = await this._runNullable(
      () =>
        this._db
          .from(this._table)
          .update(updates)
          .eq("id",        sessionId)
          .eq("doctor_id", doctorId)
          .is("deleted_at", null)
          .select(SESSION_DETAIL_SELECT)
          .single(),
      "update",
    );
    if (!result) throw new SessionNotFoundError(sessionId);
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // STATE MACHINE — ATOMIC TRANSITION
  // ─────────────────────────────────────────────────────────────

  /**
   * Atomically transitions a session's status.
   *
   * The WHERE clause includes `status = fromStatus` so that two
   * concurrent workers cannot both claim the same transition — only the
   * first UPDATE wins; the second gets 0 rows back and we throw.
   *
   * @param {string} sessionId
   * @param {string} doctorId
   * @param {string} fromStatus
   * @param {string} toStatus
   * @param {Partial<ScribeSession>} [extra={}]  Additional columns to update atomically.
   * @returns {Promise<ScribeSession>}
   */
  async transitionStatus(sessionId, doctorId, fromStatus, toStatus, extra = {}) {
    const result = await this._runNullable(
      () =>
        this._db
          .from(this._table)
          .update({ status: toStatus, ...extra })
          .eq("id",        sessionId)
          .eq("doctor_id", doctorId)
          .eq("status",    fromStatus) // optimistic concurrency guard
          .is("deleted_at", null)
          .select(SESSION_DETAIL_SELECT)
          .single(),
      "transitionStatus",
    );
    if (!result) throw new SessionNotFoundError(sessionId);
    return result;
  }

  /**
   * Sets status to FAILED and records the error message.
   * Safe to call from any non-terminal state.
   *
   * @param {string} sessionId
   * @param {string} errorMessage
   * @returns {Promise<void>}
   */
  async markFailed(sessionId, errorMessage) {
    await this._run(
      () =>
        this._db
          .from(this._table)
          .update({ status: SESSION_STATUS.FAILED, error_message: errorMessage })
          .eq("id", sessionId)
          .not("status", "in", `(${SESSION_STATUS.COMPLETED})`)
          .select("id")
          .single(),
      "markFailed",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // FINALIZE UPLOAD
  // ─────────────────────────────────────────────────────────────

  /**
   * Transitions UPLOADING → UPLOADED and persists audio metadata in one UPDATE.
   *
   * @param {string} sessionId
   * @param {string} doctorId
   * @param {{ total_chunks: number; audio_duration_seconds: number; audio_size_bytes: number }} meta
   * @returns {Promise<ScribeSession>}
   */
  async finalizeUpload(sessionId, doctorId, meta) {
    return this.transitionStatus(
      sessionId,
      doctorId,
      SESSION_STATUS.UPLOADING,
      SESSION_STATUS.UPLOADED,
      {
        audio_total_chunks:     meta.total_chunks,
        audio_duration_seconds: meta.audio_duration_seconds,
        audio_size_bytes:       meta.audio_size_bytes,
        upload_progress:        100,
      },
    );
  }

  // ─────────────────────────────────────────────────────────────
  // CHUNK MANAGEMENT
  // ─────────────────────────────────────────────────────────────

  /**
   * Atomically increments audio_confirmed_chunks and upload_progress.
   * upload_progress = round(confirmed / total * 100), capped at 99
   * (100 is set only on finalize).
   *
   * @param {string} sessionId
   * @param {number} totalChunks
   * @returns {Promise<void>}
   */
  async incrementConfirmedChunks(sessionId, totalChunks) {
    await this._run(
      () =>
        this._db.rpc("scribe_increment_confirmed_chunks", {
          p_session_id:  sessionId,
          p_total_chunks: totalChunks,
        }),
      "incrementConfirmedChunks",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // SOFT DELETE
  // ─────────────────────────────────────────────────────────────

  /**
   * Soft-deletes a session. Hard deletion is managed by a Postgres retention policy.
   *
   * @param {string} sessionId
   * @param {string} doctorId
   * @returns {Promise<void>}
   */
  async softDelete(sessionId, doctorId) {
    const result = await this._runNullable(
      () =>
        this._db
          .from(this._table)
          .update({ deleted_at: new Date().toISOString() })
          .eq("id",        sessionId)
          .eq("doctor_id", doctorId)
          .is("deleted_at", null)
          .select("id")
          .single(),
      "softDelete",
    );
    if (!result) throw new SessionNotFoundError(sessionId);
  }

  // ─────────────────────────────────────────────────────────────
  // WATCHDOG QUERIES
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns sessions stuck in a PROCESSING state past `olderThanMinutes`.
   * Used by the watchdog cron to detect and recover hung jobs.
   *
   * @param {string[]} processingStatuses
   * @param {number}   olderThanMinutes
   * @returns {Promise<Pick<ScribeSession, "id"|"status"|"updated_at">[]>}
   */
  async findStaleInProcessing(processingStatuses, olderThanMinutes) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("id, status, updated_at")
          .in("status", processingStatuses)
          .lte("updated_at", cutoff)
          .is("deleted_at", null),
      "findStaleInProcessing",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIO CHUNKS sub-table
  // ─────────────────────────────────────────────────────────────

  /**
   * Registers a newly uploaded audio chunk.
   *
   * @param {{
   *   session_id:    string;
   *   chunk_index:   number;
   *   storage_path:  string;
   *   size_bytes:    number;
   *   duration_ms:   number;
   *   checksum?:     string|null;
   * }} chunk
   * @returns {Promise<ScribeAudioChunk>}
   */
  async insertChunk(chunk) {
    return this._run(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .insert({ ...chunk, confirmed: false, upload_attempts: 1 })
          .select("*")
          .single(),
      "insertChunk",
    );
  }

  /**
   * Pre-registers the expected upload manifest for a session.
   * Existing rows are updated so retrying /uploads/start is idempotent.
   *
   * @param {Array<{
   *   session_id: string;
   *   chunk_index: number;
   *   storage_path: string;
   *   size_bytes: number;
   *   duration_ms: number;
   *   checksum?: string|null;
   *   mime_type?: string|null;
   *   signed_url_expires_at?: string|null;
   * }>} chunks
   * @returns {Promise<ScribeAudioChunk[]>}
   */
  async upsertUploadChunks(chunks) {
    return this._run(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .upsert(
            chunks.map((chunk) => ({
              ...chunk,
              confirmed: false,
              upload_status: "signed",
              error_message: null,
            })),
            { onConflict: "session_id,chunk_index" },
          )
          .select("*")
          .order("chunk_index", { ascending: true }),
      "upsertUploadChunks",
    );
  }

  /**
   * Marks a chunk as confirmed (integrity verified).
   *
   * @param {string} sessionId
   * @param {number} chunkIndex
   * @returns {Promise<void>}
   */
  async confirmChunk(sessionId, chunkIndex) {
    await this._run(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .update({ confirmed: true })
          .eq("session_id",  sessionId)
          .eq("chunk_index", chunkIndex),
      "confirmChunk",
    );
  }

  /**
   * Marks a chunk as signed and increments its upload_attempts counter.
   *
   * @param {string} sessionId
   * @param {number} chunkIndex
   * @param {string} expiresAt
   * @returns {Promise<ScribeAudioChunk>}
   */
  async markChunkSigned(sessionId, chunkIndex, expiresAt) {
    const result = await this._runNullable(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .update({
            upload_status: "signed",
            signed_url_expires_at: expiresAt,
            error_message: null,
          })
          .eq("session_id", sessionId)
          .eq("chunk_index", chunkIndex)
          .select("*")
          .single(),
      "markChunkSigned",
    );
    if (!result) throw new SessionNotFoundError(sessionId);
    return result;
  }

  /**
   * Marks a chunk as uploaded and confirmed.
   *
   * @param {string} sessionId
   * @param {number} chunkIndex
   * @returns {Promise<ScribeAudioChunk>}
   */
  async markChunkUploaded(sessionId, chunkIndex) {
    const result = await this._runNullable(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .update({
            confirmed: true,
            upload_status: "uploaded",
            uploaded_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("session_id", sessionId)
          .eq("chunk_index", chunkIndex)
          .select("*")
          .single(),
      "markChunkUploaded",
    );
    if (!result) throw new SessionNotFoundError(sessionId);
    return result;
  }

  /**
   * Marks a chunk upload failed. Used after storage verification fails.
   *
   * @param {string} sessionId
   * @param {number} chunkIndex
   * @param {string} errorMessage
   * @returns {Promise<void>}
   */
  async markChunkFailed(sessionId, chunkIndex, errorMessage) {
    await this._run(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .update({
            upload_status: "failed",
            error_message: errorMessage,
          })
          .eq("session_id", sessionId)
          .eq("chunk_index", chunkIndex),
      "markChunkFailed",
    );
  }

  /**
   * Increments upload_attempts after a retry URL is issued.
   *
   * @param {string} sessionId
   * @param {number} chunkIndex
   * @returns {Promise<void>}
   */
  async incrementChunkAttempt(sessionId, chunkIndex) {
    const chunk = await this.findChunk(sessionId, chunkIndex);
    if (!chunk) throw new SessionNotFoundError(sessionId);
    await this._run(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .update({ upload_attempts: (chunk.upload_attempts ?? 0) + 1 })
          .eq("session_id", sessionId)
          .eq("chunk_index", chunkIndex),
      "incrementChunkAttempt",
    );
  }

  /**
   * Fetches one chunk by session and index.
   *
   * @param {string} sessionId
   * @param {number} chunkIndex
   * @returns {Promise<ScribeAudioChunk|null>}
   */
  async findChunk(sessionId, chunkIndex) {
    return this._runNullable(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .select("*")
          .eq("session_id", sessionId)
          .eq("chunk_index", chunkIndex)
          .single(),
      "findChunk",
    );
  }

  /**
   * Returns all confirmed chunks for a session, ordered by index.
   *
   * @param {string} sessionId
   * @returns {Promise<ScribeAudioChunk[]>}
   */
  async getConfirmedChunks(sessionId) {
    return this._run(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .select("*")
          .eq("session_id", sessionId)
          .eq("confirmed",  true)
          .order("chunk_index", { ascending: true }),
      "getConfirmedChunks",
    );
  }

  /**
   * Returns all chunks for a session, ordered by index.
   *
   * @param {string} sessionId
   * @returns {Promise<ScribeAudioChunk[]>}
   */
  async getChunks(sessionId) {
    return this._run(
      () =>
        this._db
          .from("scribe_audio_chunks")
          .select("*")
          .eq("session_id", sessionId)
          .order("chunk_index", { ascending: true }),
      "getChunks",
    );
  }

  // ─────────────────────────────────────────────────────────────
  // PROCESSING QUEUE sub-table
  // ─────────────────────────────────────────────────────────────

  /**
   * Enqueues a processing job.
   * The UNIQUE index on (session_id, job_type) WHERE status IN
   * ('pending','processing') prevents duplicate jobs being enqueued.
   *
   * @param {{
   *   session_id: string;
   *   job_type:   string;
   *   priority?:  number;
   *   metadata?:  Record<string, unknown>;
   * }} job
   * @returns {Promise<ProcessingQueueJob>}
   */
  async enqueueJob(job) {
    return this._run(
      () =>
        this._db
          .from("scribe_processing_queue")
          .insert({
            session_id:   job.session_id,
            job_type:     job.job_type,
            priority:     job.priority ?? 5,
            metadata:     job.metadata ?? {},
            status:       "pending",
            attempt_count: 0,
            max_attempts:  3,
            scheduled_at: new Date().toISOString(),
          })
          .select("*")
          .single(),
      "enqueueJob",
    );
  }

  /**
   * Returns the most recent job of a given type for a session.
   *
   * @param {string} sessionId
   * @param {string} jobType
   * @returns {Promise<ProcessingQueueJob|null>}
   */
  async findJob(sessionId, jobType) {
    return this._runNullable(
      () =>
        this._db
          .from("scribe_processing_queue")
          .select("*")
          .eq("session_id", sessionId)
          .eq("job_type",   jobType)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
      "findJob",
    );
  }
}
