/**
 * @fileoverview TranscriptionService — orchestrates the transcription pipeline.
 *
 * State machine owned here:
 *   UPLOADED / TRANSCRIPTION_FAILED → TRANSCRIPTION_QUEUED → TRANSCRIBING
 *   → TRANSCRIBED  (success)
 *   → TRANSCRIPTION_FAILED  (all retries exhausted)
 *
 * Provider strategy:
 *   All speech-to-text work is delegated to a TranscriptionProvider instance.
 *   The default provider is DeepgramProvider (nova-2-medical).
 *   Swap the provider via the TRANSCRIPTION_PROVIDER env var without touching
 *   this service.
 */

import { createLogger } from "../logger.js";
import {
  AUDIT_ACTION,
  JOB_STATUS,
  SCRIBE_LIMITS,
  SCRIBE_STORAGE,
  SESSION_STATUS,
  TRANSCRIPTION_CONFIG,
  TRANSCRIPTION_STATUS,
} from "../constants.js";
import {
  InvalidStateTransitionError,
  SessionNotFoundError,
  SessionValidationError,
  StorageError,
  TranscriptionNotReadyError,
  TranscriptionRetryExhaustedError,
} from "../errors.js";
import {
  QueueTranscriptionSchema,
  RecoverTranscriptionJobsSchema,
  RetryTranscriptionSchema,
  TranscriptionWorkerSchema,
} from "../schemas.js";
import { createTranscriptionProvider } from "./transcription-providers/provider-factory.js";
import {
  buildInlineTranscriptionJob,
  failInlineTranscriptionJob,
  isInlineTranscriptionJob,
} from "../lib/transcription-jobs.js";
import { mergeTranscriptionResults } from "../lib/merge-transcription-results.js";

export class TranscriptionService {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/transcription.repository.js").TranscriptionRepository} transcriptionRepository
   * @param {import("./audit.service.js").AuditService} auditService
   * @param {import("./transcription-providers/transcription-provider.js").TranscriptionProvider} [provider]
   */
  constructor(supabase, sessionRepository, transcriptionRepository, auditService, provider) {
    this._db             = supabase;
    this._sessions       = sessionRepository;
    this._transcriptions = transcriptionRepository;
    this._audit          = auditService;
    this._provider       = provider ?? createTranscriptionProvider();
    this._log            = createLogger({ component: "TranscriptionService" });
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────

  /**
   * Validates state and enqueues a transcription job for a doctor-owned session.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async queueSession(sessionId, rawInput, ctx) {
    const parsed = QueueTranscriptionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    if (
      session.status === SESSION_STATUS.TRANSCRIPTION_QUEUED ||
      session.status === SESSION_STATUS.TRANSCRIBING
    ) {
      const transcription = await this._transcriptions.findBySession(sessionId);
      return { session, transcription, queued: false, reason: "already_queued_or_processing" };
    }

    if (
      session.status !== SESSION_STATUS.UPLOADED &&
      session.status !== SESSION_STATUS.TRANSCRIPTION_FAILED
    ) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.TRANSCRIPTION_QUEUED);
    }

    const nextSession = await this._sessions.transitionStatus(
      sessionId,
      ctx.doctorId,
      session.status,
      SESSION_STATUS.TRANSCRIPTION_QUEUED,
      { error_message: null },
    );

    const now = new Date().toISOString();
    const transcription = await this._transcriptions.upsertTranscription({
      session_id:    sessionId,
      clinic_id:     ctx.clinicId,
      doctor_id:     ctx.doctorId,
      provider:      this._provider.name,
      model:         this._provider.model,
      language:      session.language,
      status:        TRANSCRIPTION_STATUS.QUEUED,
      attempt_count: 0,
      queued_at:     now,
      error:         null,
    });

    let job;
    let created = false;
    try {
      const enqueued = await this._transcriptions.enqueue({
        sessionId,
        priority: input.priority,
        metadata: {
          clinicId:  ctx.clinicId,
          doctorId:  ctx.doctorId,
          queuedBy:  ctx.actorId,
          force:     input.force,
        },
      });
      job = enqueued.job;
      created = enqueued.created;
    } catch (err) {
      this._log.warn("Queue insert failed — using inline transcription job", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      job = buildInlineTranscriptionJob(sessionId, input.priority, ctx);
      created = true;
    }

    await this._audit.log({
      action: AUDIT_ACTION.TRANSCRIPTION_QUEUED,
      sessionId,
      ctx,
      metadata: { jobId: job.id, created, priority: input.priority, inline: isInlineTranscriptionJob(job) },
    });

    return { session: nextSession, transcription, job, queued: true };
  }

  /**
   * In-memory job used when the DB queue is unavailable (e.g. missing RLS grants).
   * @param {string} sessionId
   * @param {number} [priority]
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  /**
   * Requeues transcription after a failed attempt.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async retrySession(sessionId, rawInput, ctx) {
    const parsed = RetryTranscriptionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (session.status !== SESSION_STATUS.TRANSCRIPTION_FAILED && !parsed.data.force) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.TRANSCRIPTION_QUEUED);
    }

    return this.queueSession(sessionId, { priority: 8, force: true }, ctx);
  }

  /**
   * Returns the current transcription summary and all segments for a session.
   *
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async getTranscription(sessionId, ctx) {
    const session = await this._sessions.findByIdForClinic(sessionId, ctx.clinicId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const transcription = await this._transcriptions.findBySession(sessionId);
    const segments      = await this._transcriptions.getSegments(sessionId);
    return { session, transcription, segments };
  }

  /**
   * Queues (if needed) and processes transcription for a single session.
   * Used from the doctor UI so local dev does not require a separate worker cron.
   *
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async runForSession(sessionId, ctx) {
    let session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    if (session.status === SESSION_STATUS.TRANSCRIBED) {
      return {
        session,
        result: { sessionId, status: "already_transcribed" },
      };
    }

    if (
      session.status === SESSION_STATUS.UPLOADED ||
      session.status === SESSION_STATUS.TRANSCRIPTION_FAILED
    ) {
      await this.queueSession(sessionId, { priority: 10, force: true }, ctx);
      session = await this._sessions.findById(sessionId, ctx.doctorId);
    }

    if (
      session.status !== SESSION_STATUS.TRANSCRIPTION_QUEUED &&
      session.status !== SESSION_STATUS.TRANSCRIBING
    ) {
      throw new TranscriptionNotReadyError(
        `Session status '${session.status}' is not ready for transcription`,
      );
    }

    let job = await this._transcriptions.findActiveJob(sessionId);
    if (!job) {
      job = buildInlineTranscriptionJob(sessionId, 10, ctx);
    }

    const workerId = `doctor_${ctx.actorId}`;
    if (job.status === JOB_STATUS.PENDING && !isInlineTranscriptionJob(job)) {
      const claimed = await this._transcriptions.claimJobById(job.id, workerId);
      if (!claimed) {
        job = await this._transcriptions.findActiveJob(sessionId) ?? job;
      } else {
        job = claimed;
      }
    }

    const result = await this._processJob(job, workerId);
    const updatedSession = await this._sessions.findById(sessionId, ctx.doctorId);
    return { session: updatedSession, result };
  }

  /**
   * Worker entry-point. Claims and processes up to batch_size pending jobs.
   *
   * @param {Record<string,unknown>} rawInput
   */
  async processQueue(rawInput) {
    const parsed = TranscriptionWorkerSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const { batch_size: batchSize, worker_id: workerId = `worker_${Date.now()}` } = parsed.data;

    const results = [];
    for (let i = 0; i < batchSize; i++) {
      const job = await this._transcriptions.claimNextJob(workerId);
      if (!job) break;
      results.push(await this._processJob(job, workerId));
    }

    return { processed: results.length, results };
  }

  /**
   * Finds and requeues stale processing jobs, resetting their sessions.
   *
   * @param {Record<string,unknown>} rawInput
   */
  async recoverStaleJobs(rawInput) {
    const parsed = RecoverTranscriptionJobsSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const jobs      = await this._transcriptions.findStaleProcessingJobs(parsed.data.stale_minutes);
    const recovered = [];

    for (const job of jobs) {
      await this._transcriptions.requeueJob(job.id);
      const session = await this._sessions.findByIdForWorker(job.session_id);
      if (session?.status === SESSION_STATUS.TRANSCRIBING) {
        await this._sessions.transitionStatus(
          session.id,
          session.doctor_id,
          SESSION_STATUS.TRANSCRIBING,
          SESSION_STATUS.TRANSCRIPTION_QUEUED,
          { error_message: "Recovered stale transcription job" },
        );
      }
      recovered.push(job.id);
    }

    return { recovered };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE — JOB PROCESSING
  // ─────────────────────────────────────────────────────────────

  /**
   * Processes a single claimed job end-to-end.
   *
   * @param {Record<string,unknown>} job
   * @param {string}                 workerId
   */
  async _processJob(job, workerId) {
    const startedAt = Date.now();
    const session   = await this._sessions.findByIdForWorker(job.session_id);

    if (!session) {
      await this._failQueueJob(job, "Session not found", false);
      return { jobId: job.id, status: JOB_STATUS.FAILED, error: "Session not found" };
    }

    const ctx = contextFromSession(session, workerId);

    try {
      if (session.status === SESSION_STATUS.TRANSCRIBED) {
        await this._completeQueueJob(job);
        return { jobId: job.id, sessionId: session.id, status: "already_transcribed" };
      }

      if (
        session.status !== SESSION_STATUS.TRANSCRIPTION_QUEUED &&
        session.status !== SESSION_STATUS.UPLOADED &&
        session.status !== SESSION_STATUS.TRANSCRIBING
      ) {
        throw new TranscriptionNotReadyError(
          `Session status '${session.status}' is not ready for transcription`,
        );
      }

      if (session.status !== SESSION_STATUS.TRANSCRIBING) {
        const fromStatus = session.status;
        await this._sessions.transitionStatus(
          session.id,
          session.doctor_id,
          fromStatus,
          SESSION_STATUS.TRANSCRIBING,
          { error_message: null },
        );
      }

      await this._transcriptions.upsertTranscription({
        session_id:    session.id,
        clinic_id:     session.clinic_id,
        doctor_id:     session.doctor_id,
        provider:      this._provider.name,
        model:         this._provider.model,
        language:      session.language,
        status:        TRANSCRIPTION_STATUS.PROCESSING,
        attempt_count: job.attempt_count,
        started_at:    new Date().toISOString(),
        error:         null,
      });

      await this._audit.log({
        action:    AUDIT_ACTION.TRANSCRIPTION_STARTED,
        sessionId: session.id,
        ctx,
        metadata:  { jobId: job.id, attempt: job.attempt_count, provider: this._provider.name },
      });

      // ── Core transcription call ──────────────────────────────────────────
      const result            = await this._transcribeSessionAudio(session);
      const completedAt       = new Date().toISOString();
      const processingDurationMs = Date.now() - startedAt;

      // ── Persist transcription summary row ────────────────────────────────
      const transcription = await this._transcriptions.upsertTranscription({
        session_id:              session.id,
        clinic_id:               session.clinic_id,
        doctor_id:               session.doctor_id,
        provider:                this._provider.name,
        model:                   result.model,
        language:                result.language,
        full_text:               result.text,
        text:                    result.text,
        segments:                result.segments,
        speaker_map:             result.speakerMap,
        low_confidence_segments: result.lowConfidenceSegments,
        low_confidence_count:    result.lowConfidenceSegments.length,
        average_confidence:      result.averageConfidence,
        confidence_summary:      result.confidenceSummary,
        provider_response:       result.providerResponse,
        transcription_model:     result.model,
        chunk_count:             result.chunkCount,
        cost_cents:              result.costCents,
        processing_duration_ms:  processingDurationMs,
        status:                  TRANSCRIPTION_STATUS.COMPLETED,
        attempt_count:           job.attempt_count,
        completed_at:            completedAt,
        error:                   null,
      });

      // ── Persist normalised segments ───────────────────────────────────────
      await this._transcriptions.replaceSegments(
        transcription.id,
        session.id,
        result.segments.map((seg) => ({
          segment_index:     seg.index,
          start_seconds:     seg.start,
          end_seconds:       seg.end,
          text:              seg.text,
          speaker:           seg.speaker,
          speaker_label:     seg.speaker_label,
          confidence:        seg.confidence,
          is_low_confidence: seg.is_low_confidence,
          provider_metadata: seg.provider_metadata,
        })),
      );

      // ── TRANSCRIBING → TRANSCRIBED ───────────────────────────────────────
      await this._sessions.transitionStatus(
        session.id,
        session.doctor_id,
        SESSION_STATUS.TRANSCRIBING,
        SESSION_STATUS.TRANSCRIBED,
        { error_message: null },
      );
      await this._completeQueueJob(job);

      await this._audit.log({
        action:    AUDIT_ACTION.TRANSCRIPTION_COMPLETED,
        sessionId: session.id,
        ctx,
        metadata:  {
          jobId:              job.id,
          provider:           this._provider.name,
          model:              result.model,
          segmentCount:       result.segments.length,
          lowConfidenceCount: result.lowConfidenceSegments.length,
          costCents:          result.costCents,
          durationMs:         processingDurationMs,
        },
      });

      return { jobId: job.id, sessionId: session.id, status: JOB_STATUS.COMPLETED };
    } catch (err) {
      return this._handleJobError(err, job, session, ctx);
    }
  }

  /**
   * Downloads audio chunks from storage, then calls the provider.
   *
   * @param {Record<string,unknown>} session
   * @returns {Promise<import('./transcription-providers/transcription-provider.js').TranscriptionResult & { chunkCount: number }>}
   */
  async _transcribeSessionAudio(session) {
    const chunks = await this._sessions.getConfirmedChunks(session.id);
    if (!chunks.length) {
      throw new TranscriptionNotReadyError(
        "No confirmed audio chunks found for this session",
      );
    }

    if (session.audio_size_bytes > SCRIBE_LIMITS.MAX_AUDIO_SIZE_BYTES) {
      throw new TranscriptionNotReadyError(
        `Audio size ${session.audio_size_bytes} bytes exceeds the ${SCRIBE_LIMITS.MAX_AUDIO_SIZE_BYTES}-byte limit`,
      );
    }

    this._log.info("Downloading audio chunks for transcription", {
      sessionId:  session.id,
      chunkCount: chunks.length,
    });

    const ext = chunks[0].storage_path.slice(chunks[0].storage_path.lastIndexOf(".") + 1);
    const mimeType = MIME_TYPES[ext] ?? "audio/webm";

    if (chunks.length === 1) {
      const audioBlob = await this._downloadChunk(chunks[0].storage_path);
      const result = await this._provider.transcribe({
        audioBlobs: [audioBlob],
        mimeType,
        language: session.language,
        sessionId: session.id,
        durationSeconds: session.audio_duration_seconds ?? null,
      });
      return { ...result, chunkCount: 1 };
    }

    // WebM/Ogg chunks from MediaRecorder are independent containers — concatenating
    // raw bytes produces corrupt audio. Transcribe each chunk and merge timelines.
    this._log.info("Transcribing session in per-chunk mode", {
      sessionId: session.id,
      chunkCount: chunks.length,
    });

    /** @type {import('./transcription-providers/transcription-provider.js').TranscriptionResult[]} */
    const chunkResults = [];
    const timeOffsets = [];
    let cumulativeOffset = 0;

    for (const chunk of chunks) {
      timeOffsets.push(cumulativeOffset);
      const audioBlob = await this._downloadChunk(chunk.storage_path);
      const chunkDurationSeconds =
        chunk.duration_ms != null ? Number(chunk.duration_ms) / 1000 : null;

      const result = await this._provider.transcribe({
        audioBlobs: [audioBlob],
        mimeType,
        language: session.language,
        sessionId: session.id,
        durationSeconds: chunkDurationSeconds,
      });

      chunkResults.push(result);
      const advance =
        result.durationSeconds ??
        chunkDurationSeconds ??
        (chunkResults.length === chunks.length
          ? 0
          : (session.audio_duration_seconds ?? 0) / chunks.length);
      cumulativeOffset += advance;
    }

    return mergeTranscriptionResults(chunkResults, timeOffsets);
  }

  /**
   * Downloads one audio chunk blob from Supabase Storage.
   *
   * @param {string} storagePath
   * @returns {Promise<Blob>}
   */
  async _downloadChunk(storagePath) {
    const { data, error } = await this._db.storage
      .from(SCRIBE_STORAGE.BUCKET)
      .download(storagePath);
    if (error || !data) throw new StorageError("download audio chunk", error);
    return data;
  }

  /**
   * Handles a job failure: marks job as failed or pending-retry, updates
   * transcription row, rolls back session status, and emits audit event.
   *
   * @param {unknown}                err
   * @param {Record<string,unknown>} job
   * @param {Record<string,unknown>} session
   * @param {Record<string,unknown>} ctx
   */
  async _handleJobError(err, job, session, ctx) {
    const message  = err instanceof Error ? err.message : String(err);
    const retryable = isRetryable(err);

    const updatedJob = await this._failQueueJob(job, message, retryable);

    const nextTranscriptionStatus =
      updatedJob.status === JOB_STATUS.PENDING
        ? TRANSCRIPTION_STATUS.QUEUED
        : TRANSCRIPTION_STATUS.FAILED;

    await this._transcriptions.upsertTranscription({
      session_id:    session.id,
      clinic_id:     session.clinic_id,
      doctor_id:     session.doctor_id,
      provider:      this._provider.name,
      model:         this._provider.model,
      language:      session.language,
      status:        nextTranscriptionStatus,
      attempt_count: job.attempt_count,
      failed_at:     updatedJob.status === JOB_STATUS.FAILED ? new Date().toISOString() : null,
      error:         message,
    });

    const current = await this._sessions.findByIdForWorker(session.id);
    if (current?.status === SESSION_STATUS.TRANSCRIBING) {
      await this._sessions.transitionStatus(
        session.id,
        session.doctor_id,
        SESSION_STATUS.TRANSCRIBING,
        updatedJob.status === JOB_STATUS.PENDING
          ? SESSION_STATUS.TRANSCRIPTION_QUEUED
          : SESSION_STATUS.TRANSCRIPTION_FAILED,
        { error_message: message },
      );
    }

    await this._audit.log({
      action: updatedJob.status === JOB_STATUS.PENDING
        ? AUDIT_ACTION.JOB_RETRY
        : AUDIT_ACTION.TRANSCRIPTION_FAILED,
      sessionId: session.id,
      ctx,
      metadata: {
        jobId:    job.id,
        attempt:  job.attempt_count,
        retryable,
        final:    updatedJob.status === JOB_STATUS.FAILED,
        error:    message,
      },
    });

    this._log.error("Transcription job failed", {
      sessionId: session.id,
      jobId:     job.id,
      retryable,
      error:     message,
    });

    if (updatedJob.status === JOB_STATUS.FAILED && job.attempt_count >= job.max_attempts) {
      return {
        jobId:     job.id,
        sessionId: session.id,
        status:    JOB_STATUS.FAILED,
        error:     new TranscriptionRetryExhaustedError().message,
      };
    }
    return { jobId: job.id, sessionId: session.id, status: updatedJob.status, error: message };
  }

  /** @param {Record<string, unknown>} job */
  async _completeQueueJob(job) {
    if (isInlineTranscriptionJob(job)) return;
    await this._transcriptions.completeJob(job.id);
  }

  /**
   * @param {Record<string, unknown>} job
   * @param {string} message
   * @param {boolean} retryable
   */
  async _failQueueJob(job, message, retryable) {
    if (isInlineTranscriptionJob(job)) {
      return failInlineTranscriptionJob(job, message, retryable);
    }
    return this._transcriptions.failJob(
      job.id,
      message,
      retryable,
      job.attempt_count,
      job.max_attempts,
    );
  }
}

// ─────────────────────────────────────────────────────────────
// MODULE-LEVEL HELPERS
// ─────────────────────────────────────────────────────────────

/** @type {Record<string, string>} File extension → MIME type */
const MIME_TYPES = {
  webm: "audio/webm",
  ogg:  "audio/ogg",
  mp4:  "audio/mp4",
  m4a:  "audio/mp4",
  wav:  "audio/wav",
  mp3:  "audio/mpeg",
};

/**
 * Builds a RequestContext-shaped object from a session row for worker use.
 *
 * @param {Record<string,unknown>} session
 * @param {string}                 workerId
 * @returns {Record<string,string>}
 */
function contextFromSession(session, workerId) {
  return {
    actorId:   session.doctor_id,
    doctorId:  session.doctor_id,
    clinicId:  session.clinic_id,
    requestId: workerId,
  };
}

/**
 * Returns true when the error is transient and worth retrying.
 * Storage and provider network errors are retryable; bad-state errors are not.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isRetryable(err) {
  if (err?.code === "TRANSCRIPTION_NOT_READY") return false;
  if (err?.code === "VALIDATION_ERROR")        return false;
  if (err?.code === "SESSION_NOT_FOUND")       return false;
  return true;
}
