/**
 * @fileoverview Production transcription service.
 *
 * Owns UPLOADED → TRANSCRIPTION_QUEUED → TRANSCRIBING →
 * TRANSCRIBED / TRANSCRIPTION_FAILED.
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
import { OpenAITranscriptionClient } from "./openai-transcription.client.js";

export class TranscriptionService {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/transcription.repository.js").TranscriptionRepository} transcriptionRepository
   * @param {import("./audit.service.js").AuditService} auditService
   * @param {OpenAITranscriptionClient} [openaiClient]
   */
  constructor(supabase, sessionRepository, transcriptionRepository, auditService, openaiClient) {
    this._db = supabase;
    this._sessions = sessionRepository;
    this._transcriptions = transcriptionRepository;
    this._audit = auditService;
    this._openai = openaiClient ?? new OpenAITranscriptionClient();
    this._log = createLogger({ component: "TranscriptionService" });
  }

  /**
   * Queues transcription for a doctor-owned uploaded session.
   *
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
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
      session_id: sessionId,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      provider: TRANSCRIPTION_CONFIG.PROVIDER,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || TRANSCRIPTION_CONFIG.DEFAULT_MODEL,
      language: session.language,
      status: TRANSCRIPTION_STATUS.QUEUED,
      attempt_count: 0,
      queued_at: now,
      error: null,
    });

    const { job, created } = await this._transcriptions.enqueue({
      sessionId,
      priority: input.priority,
      metadata: {
        clinicId: ctx.clinicId,
        doctorId: ctx.doctorId,
        queuedBy: ctx.actorId,
        force: input.force,
      },
    });

    await this._audit.log({
      action: AUDIT_ACTION.TRANSCRIPTION_QUEUED,
      sessionId,
      ctx,
      metadata: {
        jobId: job.id,
        created,
        priority: input.priority,
      },
    });

    return { session: nextSession, transcription, job, queued: true };
  }

  /**
   * Retries transcription after a failed attempt.
   *
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
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
   * Fetches transcription summary and segments.
   *
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async getTranscription(sessionId, ctx) {
    const session = await this._sessions.findByIdForClinic(sessionId, ctx.clinicId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const transcription = await this._transcriptions.findBySession(sessionId);
    const segments = await this._transcriptions.getSegments(sessionId);
    return { session, transcription, segments };
  }

  /**
   * Worker entrypoint. Processes up to batch_size jobs.
   *
   * @param {Record<string, unknown>} rawInput
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
   * Requeues stale processing jobs and marks their sessions as queued again.
   *
   * @param {Record<string, unknown>} rawInput
   */
  async recoverStaleJobs(rawInput) {
    const parsed = RecoverTranscriptionJobsSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const jobs = await this._transcriptions.findStaleProcessingJobs(parsed.data.stale_minutes);
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

  /** @param {Record<string, unknown>} job */
  async _processJob(job, workerId) {
    const startedAt = Date.now();
    const session = await this._sessions.findByIdForWorker(job.session_id);
    if (!session) {
      await this._transcriptions.failJob(job.id, "Session not found", false, job.attempt_count, job.max_attempts);
      return { jobId: job.id, status: JOB_STATUS.FAILED, error: "Session not found" };
    }

    const ctx = contextFromSession(session, workerId);

    try {
      if (session.status === SESSION_STATUS.TRANSCRIBED) {
        await this._transcriptions.completeJob(job.id);
        return { jobId: job.id, sessionId: session.id, status: "already_transcribed" };
      }

      if (
        session.status !== SESSION_STATUS.TRANSCRIPTION_QUEUED &&
        session.status !== SESSION_STATUS.UPLOADED
      ) {
        throw new TranscriptionNotReadyError(`Session status ${session.status} is not ready for transcription`);
      }

      const fromStatus = session.status;
      await this._sessions.transitionStatus(
        session.id,
        session.doctor_id,
        fromStatus,
        SESSION_STATUS.TRANSCRIBING,
        { error_message: null },
      );

      await this._transcriptions.upsertTranscription({
        session_id: session.id,
        clinic_id: session.clinic_id,
        doctor_id: session.doctor_id,
        provider: TRANSCRIPTION_CONFIG.PROVIDER,
        model: process.env.OPENAI_TRANSCRIPTION_MODEL || TRANSCRIPTION_CONFIG.DEFAULT_MODEL,
        language: session.language,
        status: TRANSCRIPTION_STATUS.PROCESSING,
        attempt_count: job.attempt_count,
        started_at: new Date().toISOString(),
        error: null,
      });

      await this._audit.log({
        action: AUDIT_ACTION.TRANSCRIPTION_STARTED,
        sessionId: session.id,
        ctx,
        metadata: { jobId: job.id, attempt: job.attempt_count },
      });

      const result = await this._transcribeSessionAudio(session);
      const completedAt = new Date().toISOString();
      const processingDurationMs = Date.now() - startedAt;

      const transcription = await this._transcriptions.upsertTranscription({
        session_id: session.id,
        clinic_id: session.clinic_id,
        doctor_id: session.doctor_id,
        provider: TRANSCRIPTION_CONFIG.PROVIDER,
        model: result.model,
        language: result.language,
        full_text: result.text,
        text: result.text,
        segments: result.segments,
        speaker_map: result.speakerMap,
        low_confidence_segments: result.lowConfidenceSegments,
        low_confidence_count: result.lowConfidenceSegments.length,
        average_confidence: result.averageConfidence,
        confidence_summary: result.confidenceSummary,
        provider_response: result.providerResponse,
        transcription_model: result.model,
        whisper_detected_language: result.language,
        chunk_count: result.chunkCount,
        cost_cents: result.costCents,
        processing_duration_ms: processingDurationMs,
        status: TRANSCRIPTION_STATUS.COMPLETED,
        attempt_count: job.attempt_count,
        completed_at: completedAt,
        error: null,
      });

      await this._transcriptions.replaceSegments(
        transcription.id,
        session.id,
        result.segments.map((segment) => ({
          segment_index: segment.index,
          start_seconds: segment.start,
          end_seconds: segment.end,
          text: segment.text,
          speaker: segment.speaker,
          speaker_label: segment.speaker_label,
          confidence: segment.confidence,
          is_low_confidence: segment.is_low_confidence,
          provider_metadata: segment.provider_metadata,
        })),
      );

      await this._sessions.transitionStatus(
        session.id,
        session.doctor_id,
        SESSION_STATUS.TRANSCRIBING,
        SESSION_STATUS.TRANSCRIBED,
        { error_message: null },
      );
      await this._transcriptions.completeJob(job.id);

      await this._audit.log({
        action: AUDIT_ACTION.TRANSCRIPTION_COMPLETED,
        sessionId: session.id,
        ctx,
        metadata: {
          jobId: job.id,
          segmentCount: result.segments.length,
          lowConfidenceCount: result.lowConfidenceSegments.length,
          costCents: result.costCents,
          durationMs: processingDurationMs,
        },
      });

      return { jobId: job.id, sessionId: session.id, status: JOB_STATUS.COMPLETED };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retryable = isRetryable(err);
      const updatedJob = await this._transcriptions.failJob(
        job.id,
        message,
        retryable,
        job.attempt_count,
        job.max_attempts,
      );

      await this._transcriptions.upsertTranscription({
        session_id: session.id,
        clinic_id: session.clinic_id,
        doctor_id: session.doctor_id,
        provider: TRANSCRIPTION_CONFIG.PROVIDER,
        model: process.env.OPENAI_TRANSCRIPTION_MODEL || TRANSCRIPTION_CONFIG.DEFAULT_MODEL,
        language: session.language,
        status: updatedJob.status === JOB_STATUS.PENDING
          ? TRANSCRIPTION_STATUS.QUEUED
          : TRANSCRIPTION_STATUS.FAILED,
        attempt_count: job.attempt_count,
        failed_at: updatedJob.status === JOB_STATUS.FAILED ? new Date().toISOString() : null,
        error: message,
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
        action: updatedJob.status === JOB_STATUS.PENDING ? AUDIT_ACTION.JOB_RETRY : AUDIT_ACTION.TRANSCRIPTION_FAILED,
        sessionId: session.id,
        ctx,
        metadata: {
          jobId: job.id,
          attempt: job.attempt_count,
          retryable,
          final: updatedJob.status === JOB_STATUS.FAILED,
        },
      });

      this._log.error("Transcription job failed", {
        sessionId: session.id,
        jobId: job.id,
        retryable,
        error: message,
      });

      if (updatedJob.status === JOB_STATUS.FAILED && job.attempt_count >= job.max_attempts) {
        return { jobId: job.id, sessionId: session.id, status: JOB_STATUS.FAILED, error: new TranscriptionRetryExhaustedError().message };
      }
      return { jobId: job.id, sessionId: session.id, status: updatedJob.status, error: message };
    }
  }

  /** @param {Record<string, unknown>} session */
  async _transcribeSessionAudio(session) {
    const chunks = await this._sessions.getConfirmedChunks(session.id);
    if (!chunks.length) throw new TranscriptionNotReadyError("No confirmed audio chunks found");

    const allSegments = [];
    const providerChunks = [];
    let text = "";
    let offsetSeconds = 0;
    let detectedLanguage = null;

    for (const chunk of chunks) {
      const blob = await this._downloadChunk(chunk.storage_path);
      const response = await this._openai.transcribe({
        blob,
        filename: filenameFromPath(chunk.storage_path),
        language: session.language,
        prompt: "Medical consultation audio. Preserve medicine names, symptoms, dosage terms, Hindi, English, and Hinglish words accurately.",
      });

      providerChunks.push({
        chunk_index: chunk.chunk_index,
        language: response.language ?? null,
        duration: response.duration ?? null,
      });
      detectedLanguage = detectedLanguage ?? response.language ?? null;
      text = joinText(text, response.text ?? "");

      const normalized = normalizeSegments(response.segments ?? [], offsetSeconds, allSegments.length);
      allSegments.push(...normalized);
      offsetSeconds += Math.max(chunk.duration_ms / 1000, Number(response.duration ?? 0));
    }

    const diarized = applyHeuristicDiarization(allSegments);
    const lowConfidenceSegments = diarized.filter((segment) => segment.is_low_confidence);
    const averageConfidence = average(
      diarized.map((segment) => segment.confidence).filter((v) => typeof v === "number"),
    );

    return {
      text,
      language: detectedLanguage ?? session.language ?? null,
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || TRANSCRIPTION_CONFIG.DEFAULT_MODEL,
      segments: diarized,
      lowConfidenceSegments,
      speakerMap: { A: "Doctor", B: "Patient", C: "Attendant", U: "Unknown" },
      averageConfidence,
      confidenceSummary: {
        average: averageConfidence,
        lowConfidenceThreshold: TRANSCRIPTION_CONFIG.LOW_CONFIDENCE_THRESHOLD,
        lowConfidenceCount: lowConfidenceSegments.length,
        segmentCount: diarized.length,
      },
      providerResponse: { chunks: providerChunks },
      chunkCount: chunks.length,
      costCents: estimateCostCents(session.audio_duration_seconds),
    };
  }

  /** @param {string} storagePath */
  async _downloadChunk(storagePath) {
    const { data, error } = await this._db.storage
      .from(SCRIBE_STORAGE.BUCKET)
      .download(storagePath);
    if (error || !data) throw new StorageError("download audio chunk", error);
    return data;
  }
}

/** @param {Record<string, unknown>} session @param {string} workerId */
function contextFromSession(session, workerId) {
  return {
    actorId: session.doctor_id,
    doctorId: session.doctor_id,
    clinicId: session.clinic_id,
    requestId: workerId,
  };
}

function normalizeSegments(rawSegments, offsetSeconds, startingIndex) {
  if (!rawSegments.length) return [];
  return rawSegments.map((segment, i) => {
    const confidence = confidenceFromSegment(segment);
    return {
      id: String(segment.id ?? startingIndex + i),
      index: startingIndex + i,
      start: roundSeconds(Number(segment.start ?? 0) + offsetSeconds),
      end: roundSeconds(Number(segment.end ?? 0) + offsetSeconds),
      text: String(segment.text ?? "").trim(),
      speaker: "U",
      speaker_label: "Unknown",
      confidence,
      is_low_confidence: confidence < TRANSCRIPTION_CONFIG.LOW_CONFIDENCE_THRESHOLD,
      provider_metadata: {
        avg_logprob: segment.avg_logprob ?? null,
        no_speech_prob: segment.no_speech_prob ?? null,
        compression_ratio: segment.compression_ratio ?? null,
      },
    };
  });
}

function confidenceFromSegment(segment) {
  if (typeof segment.avg_logprob === "number") {
    const noSpeech = typeof segment.no_speech_prob === "number" ? segment.no_speech_prob : 0;
    return clamp(Number(Math.exp(segment.avg_logprob) * (1 - noSpeech)).toFixed(4));
  }
  return 0.85;
}

function applyHeuristicDiarization(segments) {
  let lastSpeaker = "A";
  return segments.map((segment, index) => {
    const text = segment.text.toLowerCase();
    let speaker = lastSpeaker;

    if (index === 0) {
      speaker = "A";
    } else if (text.includes("?") || startsWithDoctorCue(text)) {
      speaker = "A";
    } else if (startsWithPatientCue(text) || segment.text.length > 80) {
      speaker = "B";
    } else if (index > 0 && shortBackchannel(text)) {
      speaker = lastSpeaker === "A" ? "B" : "A";
    }

    lastSpeaker = speaker;
    return {
      ...segment,
      speaker,
      speaker_label: speaker === "A" ? "Doctor" : "Patient",
    };
  });
}

function startsWithDoctorCue(text) {
  return /^(कब|क्या|कैसा|कितना|how|what|when|any|do you|are you|tell me)/i.test(text);
}

function startsWithPatientCue(text) {
  return /^(हाँ|हा|नहीं|no|yes|doctor|sir|madam|mujhe|मेरे|मुझे|i have|i am)/i.test(text);
}

function shortBackchannel(text) {
  return /^(yes|no|haan|nahi|okay|ok|हाँ|नहीं)[\\s.]*$/i.test(text.trim());
}

function estimateCostCents(durationSeconds) {
  const centsPerMinute = Number(
    process.env.OPENAI_TRANSCRIPTION_CENTS_PER_MINUTE ||
      TRANSCRIPTION_CONFIG.DEFAULT_COST_PER_AUDIO_MINUTE_CENTS,
  );
  return Math.ceil(((durationSeconds ?? 0) / 60) * centsPerMinute);
}

function isRetryable(err) {
  if (err?.code === "TRANSCRIPTION_NOT_READY") return false;
  if (err?.code === "STORAGE_ERROR") return true;
  if (err?.code === "TRANSCRIPTION_PROVIDER_ERROR") return true;
  return true;
}

function filenameFromPath(path) {
  return path.slice(path.lastIndexOf("/") + 1) || "audio.webm";
}

function joinText(a, b) {
  if (!a) return b.trim();
  if (!b) return a.trim();
  return `${a.trim()} ${b.trim()}`.trim();
}

function average(values) {
  if (!values.length) return null;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(4));
}

function roundSeconds(value) {
  return Number(value.toFixed(3));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}
