/**
 * @fileoverview ScribeSessionService — the core business logic layer for
 * the AI Scribe Recording Domain.
 *
 * Responsibilities:
 *  - Enforces the state machine
 *  - Enforces doctor/clinic ownership (defence-in-depth beyond RLS)
 *  - Enqueues processing jobs on state transitions
 *  - Delegates all persistence to SessionRepository
 *  - Delegates all audit writes to AuditService
 *  - NEVER touches the HTTP layer (no NextResponse, no req/res)
 *
 * Callers: API route handlers only.
 */

import { SessionRepository } from "../repository/session.repository.js";
import { AuditService }      from "./audit.service.js";
import { assertValidSessionTransition } from "../lib/session-transitions.js";
import { createLogger }      from "../logger.js";
import {
  SESSION_STATUS,
  TERMINAL_STATUSES,
  RECORDING_BLOCKING_STATUSES,
  PROCESSING_STATUSES,
  SCRIBE_STORAGE,
  JOB_TYPE,
  AUDIT_ACTION,
  SCRIBE_LIMITS,
} from "../constants.js";
import {
  SessionNotFoundError,
  InvalidStateTransitionError,
  SessionFinalizedError,
  SessionAlreadyActiveError,
  UnauthorizedSessionAccessError,
  SessionValidationError,
} from "../errors.js";
import {
  CreateSessionSchema,
  UpdateSessionSchema,
  TransitionStateSchema,
  FinalizeSessionSchema,
  SessionFilterSchema,
  RegisterChunkSchema,
} from "../schemas.js";

/** @typedef {import("../models/session.model.js").ScribeSession}      ScribeSession */
/** @typedef {import("../models/session.model.js").RequestContext}     RequestContext */
/** @typedef {import("../models/session.model.js").PaginatedResult}   PaginatedResult */
/** @typedef {import("../schemas.js").CreateSessionInput}             CreateSessionInput */
/** @typedef {import("../schemas.js").UpdateSessionInput}             UpdateSessionInput */
/** @typedef {import("../schemas.js").FinalizeSessionInput}           FinalizeSessionInput */
/** @typedef {import("../schemas.js").SessionFilterInput}             SessionFilterInput */

export class ScribeSessionService {
  /**
   * @param {SessionRepository} sessionRepository
   * @param {AuditService}      auditService
   */
  constructor(sessionRepository, auditService) {
    this._repo  = sessionRepository;
    this._audit = auditService;
    this._log   = createLogger({ component: "ScribeSessionService" });
  }

  // ─────────────────────────────────────────────────────────────
  // CREATE SESSION
  // ─────────────────────────────────────────────────────────────

  /**
   * Creates a new scribe session in CREATED status.
   *
   * Pre-condition: no other active (non-terminal, non-deleted) session
   * exists for this doctor to prevent runaway recordings.
   *
   * @param {Record<string, unknown>} rawInput - Unvalidated request body
   * @param {RequestContext}          ctx
   * @returns {Promise<ScribeSession>}
   */
  async createSession(rawInput, ctx) {
    const log = this._log.child({ component: "ScribeSessionService.createSession", doctorId: ctx.doctorId });

    // 1. Validate input
    const parsed = CreateSessionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    // 2. Clear any stuck pipeline sessions so a new consultation can always start
    await this._releaseStaleBlockingSessions(ctx.doctorId);
    await this.releaseBlockingSessions(ctx);

    // 3. Build storage prefix
    const storagePrefix = SCRIBE_STORAGE.buildPrefix(
      ctx.clinicId,
      ctx.doctorId,
      // We don't have the session ID yet — use a timestamp placeholder.
      // The actual session ID is set after INSERT.
      `tmp_${Date.now()}`,
    );

    // 4. Persist
    const session = await this._repo.create({
      doctor_id:           ctx.doctorId,
      clinic_id:           ctx.clinicId,
      patient_id:          input.patient_id     ?? null,
      appointment_id:      input.appointment_id ?? null,
      language:            input.language,
      audio_storage_prefix: storagePrefix,
    });

    // 5. Update storage prefix to use the real session ID
    const finalPrefix = SCRIBE_STORAGE.buildPrefix(ctx.clinicId, ctx.doctorId, session.id);
    const finalSession = await this._repo.update(session.id, ctx.doctorId, {
      audio_storage_prefix: finalPrefix,
    });

    // 6. Audit
    await this._audit.log({
      action:    AUDIT_ACTION.SESSION_CREATED,
      sessionId: finalSession.id,
      ctx,
      metadata:  { language: input.language, hasPatient: !!input.patient_id },
    });

    log.info("Session created", { sessionId: finalSession.id, language: input.language });
    return finalSession;
  }

  // ─────────────────────────────────────────────────────────────
  // GET SESSION
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns a single session after verifying doctor ownership.
   *
   * @param {string}         sessionId
   * @param {RequestContext} ctx
   * @returns {Promise<ScribeSession>}
   */
  async getSession(sessionId, ctx) {
    const session = await this._repo.findById(sessionId, ctx.doctorId);
    if (!session) {
      await this._audit.log({
        action:    AUDIT_ACTION.UNAUTHORIZED_ACCESS_ATTEMPT,
        sessionId,
        ctx,
        metadata:  { operation: "getSession" },
      });
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  // ─────────────────────────────────────────────────────────────
  // LIST SESSIONS
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns a paginated list of sessions for the authenticated doctor.
   *
   * @param {Record<string, unknown>} rawFilters - Unvalidated query params
   * @param {RequestContext}          ctx
   * @returns {Promise<PaginatedResult<ScribeSession>>}
   */
  async listSessions(rawFilters, ctx) {
    const parsed = SessionFilterSchema.safeParse(rawFilters);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    return this._repo.findMany(ctx.doctorId, parsed.data);
  }

  // ─────────────────────────────────────────────────────────────
  // UPDATE SESSION (data fields only)
  // ─────────────────────────────────────────────────────────────

  /**
   * Updates mutable data fields on a session.
   * Cannot change status — use transitionState() for that.
   *
   * @param {string}                     sessionId
   * @param {Record<string, unknown>}    rawInput
   * @param {RequestContext}             ctx
   * @returns {Promise<ScribeSession>}
   */
  async updateSession(sessionId, rawInput, ctx) {
    const session = await this._assertOwnership(sessionId, ctx);
    this._assertNotFinalized(session);

    const parsed = UpdateSessionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const updates = parsed.data;

    const isTranscriptEdit = !!updates.edited_transcript;
    const isSpeakerCorrect = !!updates.speaker_corrections;

    const updated = await this._repo.update(sessionId, ctx.doctorId, updates);

    const actions = [];
    if (isTranscriptEdit)  actions.push(AUDIT_ACTION.TRANSCRIPT_EDITED);
    if (isSpeakerCorrect)  actions.push(AUDIT_ACTION.SPEAKER_CORRECTED);
    if (!actions.length)   actions.push(AUDIT_ACTION.SESSION_UPDATED);

    await this._audit.logMany(
      actions.map((action) => ({
        action,
        sessionId,
        metadata: {
          updatedFields: Object.keys(updates),
          segmentCount:  updates.edited_transcript?.length ?? 0,
        },
      })),
      ctx,
    );

    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // STATE TRANSITION
  // ─────────────────────────────────────────────────────────────

  /**
   * Transitions a session's status through the state machine.
   *
   * Validates the transition is legal, applies it atomically, and
   * enqueues any downstream processing jobs automatically.
   *
   * @param {string}                  sessionId
   * @param {Record<string, unknown>} rawInput   - { to_status, reason?, metadata? }
   * @param {RequestContext}          ctx
   * @returns {Promise<ScribeSession>}
   */
  async transitionState(sessionId, rawInput, ctx) {
    const log = this._log.child({
      component: "ScribeSessionService.transitionState",
      sessionId,
    });

    const session = await this._assertOwnership(sessionId, ctx);
    this._assertNotFinalized(session);

    const parsed = TransitionStateSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const { to_status: toStatus, reason, metadata = {} } = parsed.data;

    // Validate the transition in the state machine
    this._assertValidTransition(session.status, toStatus);

    // Apply the transition atomically
    const updated = await this._repo.transitionStatus(
      sessionId,
      ctx.doctorId,
      session.status,
      toStatus,
      reason ? { error_message: null } : {},  // clear error on manual retry
    );

    // Audit
    await this._audit.log({
      action:    AUDIT_ACTION.STATE_TRANSITIONED,
      sessionId,
      ctx,
      metadata:  { from: session.status, to: toStatus, ...metadata },
    });

    // Side-effects: enqueue downstream jobs when entering key states
    await this._handleTransitionSideEffects(updated, session.status, toStatus, ctx);

    log.info("State transitioned", { from: session.status, to: toStatus });
    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // FINALIZE UPLOAD
  // ─────────────────────────────────────────────────────────────

  /**
   * Called when all audio chunks have been uploaded and confirmed.
   * Transitions UPLOADING → UPLOADED.
   *
   * Transcription is intentionally not enqueued in this module. A later
   * transcription worker will own UPLOADED → TRANSCRIBING.
   *
   * @param {string}                  sessionId
   * @param {Record<string, unknown>} rawInput  - { total_chunks, audio_duration_seconds, audio_size_bytes }
   * @param {RequestContext}          ctx
   * @returns {Promise<ScribeSession>}
   */
  async finalizeUpload(sessionId, rawInput, ctx) {
    const log = this._log.child({
      component: "ScribeSessionService.finalizeUpload",
      sessionId,
    });

    const session = await this._assertOwnership(sessionId, ctx);
    this._assertNotFinalized(session);

    if (session.status !== SESSION_STATUS.UPLOADING) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.UPLOADED);
    }

    const parsed = FinalizeSessionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const meta = parsed.data;

    // Atomic: transition + persist audio metadata in one UPDATE
    const updated = await this._repo.finalizeUpload(sessionId, ctx.doctorId, meta);

    await this._audit.log({
      action:    AUDIT_ACTION.SESSION_FINALIZED,
      sessionId,
      ctx,
      metadata:  {
        totalChunks:           meta.total_chunks,
        audioDurationSeconds:  meta.audio_duration_seconds,
        audioSizeBytes:        meta.audio_size_bytes,
      },
    });

    log.info("Upload finalized", {
      sessionId,
      chunks:   meta.total_chunks,
      durationS: meta.audio_duration_seconds,
    });

    return updated;
  }

  // ─────────────────────────────────────────────────────────────
  // REGISTER AUDIO CHUNK
  // ─────────────────────────────────────────────────────────────

  /**
   * Registers a newly uploaded audio chunk for a session.
   * The session must be in RECORDING or UPLOADING status.
   *
   * @param {string}                  sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {RequestContext}          ctx
   * @returns {Promise<import("../models/session.model.js").ScribeAudioChunk>}
   */
  async registerChunk(sessionId, rawInput, ctx) {
    const session = await this._assertOwnership(sessionId, ctx);

    if (
      session.status !== SESSION_STATUS.RECORDING &&
      session.status !== SESSION_STATUS.UPLOADING
    ) {
      throw new InvalidStateTransitionError(
        session.status,
        "CHUNK_UPLOAD (requires RECORDING or UPLOADING state)",
      );
    }

    const parsed = RegisterChunkSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const chunk = await this._repo.insertChunk({
      session_id:   sessionId,
      chunk_index:  parsed.data.chunk_index,
      storage_path: parsed.data.storage_path,
      size_bytes:   parsed.data.size_bytes,
      duration_ms:  parsed.data.duration_ms,
      checksum:     parsed.data.checksum ?? null,
    });

    await this._repo.confirmChunk(sessionId, parsed.data.chunk_index);

    await this._audit.log({
      action:    AUDIT_ACTION.CHUNK_UPLOADED,
      sessionId,
      ctx,
      metadata:  {
        chunkIndex: parsed.data.chunk_index,
        sizeBytes:  parsed.data.size_bytes,
      },
    });

    return chunk;
  }

  // ─────────────────────────────────────────────────────────────
  // SOFT DELETE
  // ─────────────────────────────────────────────────────────────

  /**
   * Soft-deletes a session. Only the owning doctor may delete.
   * Finalized sessions cannot be deleted.
   *
   * @param {string}         sessionId
   * @param {RequestContext} ctx
   * @returns {Promise<void>}
   */
  async deleteSession(sessionId, ctx) {
    const session = await this._assertOwnership(sessionId, ctx);
    this._assertNotFinalized(session);

    await this._repo.softDelete(sessionId, ctx.doctorId);

    await this._audit.log({
      action:    AUDIT_ACTION.SESSION_DELETED,
      sessionId,
      ctx,
      metadata:  { status: session.status },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // AUDIT TRAIL
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns the full audit trail for a session.
   * Verifies the session belongs to the caller's clinic.
   *
   * @param {string}         sessionId
   * @param {RequestContext} ctx
   */
  async getAuditTrail(sessionId, ctx) {
    // Use clinic-scoped lookup to allow any doctor in the clinic to read audit logs
    const session = await this._repo.findByIdForClinic(sessionId, ctx.clinicId);
    if (!session) throw new SessionNotFoundError(sessionId);

    return this._audit.getSessionAuditTrail(sessionId, ctx.clinicId);
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE — GUARDS
  // ─────────────────────────────────────────────────────────────

  /**
   * Fetches session and verifies doctor ownership.
   * Logs an unauthorized access audit event and throws on failure.
   *
   * @param {string}         sessionId
   * @param {RequestContext} ctx
   * @returns {Promise<ScribeSession>}
   */
  async _assertOwnership(sessionId, ctx) {
    const session = await this._repo.findById(sessionId, ctx.doctorId);
    if (!session) {
      await this._audit.log({
        action:    AUDIT_ACTION.UNAUTHORIZED_ACCESS_ATTEMPT,
        sessionId,
        ctx,
        metadata:  { doctorId: ctx.doctorId },
      });
      throw new SessionNotFoundError(sessionId);
    }
    return session;
  }

  /**
   * Throws SessionFinalizedError if the session is locked.
   *
   * @param {ScribeSession} session
   */
  _assertNotFinalized(session) {
    if (session.is_finalized) throw new SessionFinalizedError();
  }

  /**
   * Validates the transition is in VALID_TRANSITIONS.
   * Throws InvalidStateTransitionError if not.
   *
   * @param {string} fromStatus
   * @param {string} toStatus
   */
  _assertValidTransition(fromStatus, toStatus) {
    assertValidSessionTransition(fromStatus, toStatus);
  }

  /**
   * Ensures no active (non-terminal, non-deleted) session exists for the doctor.
   * Prevents a doctor from accidentally starting two sessions simultaneously.
   *
   * @param {string} doctorId
   * @param {string} clinicId
   * @returns {Promise<void>}
   */
  /**
   * Clears blocking sessions so a new recording can start.
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async releaseBlockingSessions(ctx) {
    const active = await this._repo.findMany(ctx.doctorId, {
      status: [...RECORDING_BLOCKING_STATUSES],
      page: 1,
      limit: 20,
      sort_by: "updated_at",
      sort_order: "desc",
    });

    for (const session of active.data ?? []) {
      await this._repo.markFailed(
        session.id,
        "Released by doctor to start a new recording",
      );
    }

    return { released: active.data?.length ?? 0 };
  }

  /**
   * Auto-fail sessions stuck in pipeline states (crashed tab, hung transcription, etc.).
   * @param {string} doctorId
   */
  async _releaseStaleBlockingSessions(doctorId) {
    const STALE_MS = 10 * 60 * 1000;
    const cutoff = new Date(Date.now() - STALE_MS).toISOString();

    const candidates = await this._repo.findMany(doctorId, {
      status: [...RECORDING_BLOCKING_STATUSES],
      page: 1,
      limit: 20,
      sort_by: "updated_at",
      sort_order: "asc",
    });

    for (const session of candidates.data ?? []) {
      if (session.updated_at && session.updated_at > cutoff) continue;
      await this._repo.markFailed(
        session.id,
        "Stale session cleared automatically to allow new recording",
      );
    }
  }

  async _assertNoActiveSession(doctorId) {
    const active = await this._repo.findMany(doctorId, {
      status: [...RECORDING_BLOCKING_STATUSES],
      page: 1,
      limit: 1,
      sort_by: "updated_at",
      sort_order: "desc",
    });

    if (active.total > 0) {
      throw new SessionAlreadyActiveError(active.data[0].id);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE — SIDE EFFECTS
  // ─────────────────────────────────────────────────────────────

  /**
   * Enqueues downstream processing jobs triggered by a state transition.
   * Runs after the transition is committed — fire-and-forget.
   *
   * @param {ScribeSession} session  - Post-transition session
   * @param {string}        fromStatus
   * @param {string}        toStatus
   * @param {RequestContext} ctx
   * @returns {Promise<void>}
   */
  async _handleTransitionSideEffects(session, fromStatus, toStatus, ctx) {
    try {
      switch (toStatus) {
        case SESSION_STATUS.UPLOADED:
          // Upload completion only. Transcription is owned by the next module.
          break;

        case SESSION_STATUS.READY_FOR_SOAP:
          // Triggered manually by the doctor after reviewing the transcript.
          // No automatic job — doctor must explicitly trigger SOAP generation.
          break;

        case SESSION_STATUS.SOAP_READY:
          // SOAP is ready — nothing to enqueue automatically.
          // Doctor triggers prescription generation via a separate action.
          break;

        default:
          break;
      }
    } catch (err) {
      // Side-effect failures must NOT roll back the state transition.
      // The session is already in the new state; jobs can be retried manually.
      this._log.error("Side-effect error after transition (non-fatal)", {
        sessionId: session.id,
        from:      fromStatus,
        to:        toStatus,
        error:     err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Enqueues a transcription job in scribe_processing_queue.
   * The UNIQUE partial index prevents duplicates while job is pending/processing.
   *
   * @param {string}         sessionId
   * @param {RequestContext} ctx
   */
  async _enqueueTranscription(sessionId, ctx) {
    try {
      await this._repo.enqueueJob({
        session_id: sessionId,
        job_type:   JOB_TYPE.TRANSCRIBE,
        priority:   5,
        metadata:   {
          clinicId:  ctx.clinicId,
          doctorId:  ctx.doctorId,
          queuedAt:  new Date().toISOString(),
        },
      });

      await this._audit.log({
        action:    AUDIT_ACTION.TRANSCRIPTION_QUEUED,
        sessionId,
        ctx,
        metadata:  { jobType: JOB_TYPE.TRANSCRIBE },
      });

      this._log.info("Transcription job enqueued", { sessionId });
    } catch (err) {
      // Likely a duplicate constraint hit (job already pending).
      // Log but do not throw — the job already exists and will be processed.
      this._log.warn("Transcription enqueue skipped (likely duplicate)", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
