/**
 * @fileoverview TranscriptionRepository — persistence layer for
 * transcription queue jobs, transcript summaries, and normalized segments.
 */

import { BaseRepository } from "./base.repository.js";
import { JOB_STATUS, JOB_TYPE, TRANSCRIPTION_STATUS } from "../constants.js";

export class TranscriptionRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "scribe_transcriptions");
  }

  /**
   * Creates or reuses a pending transcription job.
   *
   * @param {{ sessionId: string; priority?: number; metadata?: Record<string, unknown> }} input
   */
  async enqueue(input) {
    const existing = await this.findActiveJob(input.sessionId);
    if (existing) return { job: existing, created: false };

    const job = await this._run(
      () =>
        this._db
          .from("scribe_processing_queue")
          .insert({
            session_id: input.sessionId,
            job_type: JOB_TYPE.TRANSCRIBE,
            priority: input.priority ?? 5,
            status: JOB_STATUS.PENDING,
            attempt_count: 0,
            max_attempts: 3,
            metadata: input.metadata ?? {},
            scheduled_at: new Date().toISOString(),
          })
          .select("*")
          .single(),
      "enqueueTranscription",
    );

    return { job, created: true };
  }

  /** @param {string} sessionId */
  async findActiveJob(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from("scribe_processing_queue")
          .select("*")
          .eq("session_id", sessionId)
          .eq("job_type", JOB_TYPE.TRANSCRIBE)
          .in("status", [JOB_STATUS.PENDING, JOB_STATUS.PROCESSING])
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
      "findActiveTranscriptionJob",
    );
  }

  /**
   * Claims a specific pending job by id (used for doctor-triggered processing).
   *
   * @param {string} jobId
   * @param {string} workerId
   */
  async claimJobById(jobId, workerId) {
    const now = new Date().toISOString();
    const candidate = await this._runNullable(
      () =>
        this._db
          .from("scribe_processing_queue")
          .select("*")
          .eq("id", jobId)
          .single(),
      "findTranscriptionJobById",
    );

    if (!candidate || candidate.status !== JOB_STATUS.PENDING) {
      return candidate?.status === JOB_STATUS.PROCESSING ? candidate : null;
    }

    return this._runNullable(
      () =>
        this._db
          .from("scribe_processing_queue")
          .update({
            status: JOB_STATUS.PROCESSING,
            started_at: now,
            locked_at: now,
            locked_by: workerId,
            last_heartbeat_at: now,
            attempt_count: (candidate.attempt_count ?? 0) + 1,
          })
          .eq("id", jobId)
          .eq("status", JOB_STATUS.PENDING)
          .select("*")
          .single(),
      "claimTranscriptionJobById",
    );
  }

  /**
   * Claims one pending transcription job with optimistic concurrency.
   *
   * @param {string} workerId
   */
  async claimNextJob(workerId) {
    const now = new Date().toISOString();
    const candidate = await this._runNullable(
      () =>
        this._db
          .from("scribe_processing_queue")
          .select("*")
          .eq("job_type", JOB_TYPE.TRANSCRIBE)
          .eq("status", JOB_STATUS.PENDING)
          .lte("scheduled_at", now)
          .order("priority", { ascending: false })
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .single(),
      "findClaimableTranscriptionJob",
    );

    if (!candidate) return null;

    return this._runNullable(
      () =>
        this._db
          .from("scribe_processing_queue")
          .update({
            status: JOB_STATUS.PROCESSING,
            started_at: now,
            locked_at: now,
            locked_by: workerId,
            last_heartbeat_at: now,
            attempt_count: (candidate.attempt_count ?? 0) + 1,
          })
          .eq("id", candidate.id)
          .eq("status", JOB_STATUS.PENDING)
          .select("*")
          .single(),
      "claimTranscriptionJob",
    );
  }

  /** @param {string} jobId */
  async completeJob(jobId) {
    return this._run(
      () =>
        this._db
          .from("scribe_processing_queue")
          .update({
            status: JOB_STATUS.COMPLETED,
            completed_at: new Date().toISOString(),
            error: null,
          })
          .eq("id", jobId)
          .select("*")
          .single(),
      "completeTranscriptionJob",
    );
  }

  /**
   * @param {string} jobId
   * @param {string} errorMessage
   * @param {boolean} retryable
   * @param {number} attemptCount
   * @param {number} maxAttempts
   */
  async failJob(jobId, errorMessage, retryable, attemptCount, maxAttempts) {
    const retry = retryable && attemptCount < maxAttempts;
    const scheduledAt = retry
      ? new Date(Date.now() + retryDelayMs(attemptCount)).toISOString()
      : new Date().toISOString();

    return this._run(
      () =>
        this._db
          .from("scribe_processing_queue")
          .update({
            status: retry ? JOB_STATUS.PENDING : JOB_STATUS.FAILED,
            error: errorMessage,
            scheduled_at: scheduledAt,
            locked_at: null,
            locked_by: null,
            last_heartbeat_at: null,
            completed_at: retry ? null : new Date().toISOString(),
          })
          .eq("id", jobId)
          .select("*")
          .single(),
      "failTranscriptionJob",
    );
  }

  /**
   * Upserts the one-row transcription summary.
   *
   * @param {object} data
   */
  async upsertTranscription(data) {
    return this._run(
      () =>
        this._db
          .from("scribe_transcriptions")
          .upsert(data, { onConflict: "session_id" })
          .select("*")
          .single(),
      "upsertTranscription",
    );
  }

  /** @param {string} sessionId */
  async findBySession(sessionId) {
    return this._runNullable(
      () =>
        this._db
          .from("scribe_transcriptions")
          .select("*")
          .eq("session_id", sessionId)
          .single(),
      "findTranscriptionBySession",
    );
  }

  /**
   * Replaces normalized transcript segments for a transcription.
   *
   * @param {string} transcriptionId
   * @param {string} sessionId
   * @param {Array<Record<string, unknown>>} segments
   */
  async replaceSegments(transcriptionId, sessionId, segments) {
    await this._run(
      () =>
        this._db
          .from("transcription_segments")
          .delete()
          .eq("transcription_id", transcriptionId),
      "deleteExistingTranscriptionSegments",
    );

    if (!segments.length) return [];

    return this._run(
      () =>
        this._db
          .from("transcription_segments")
          .insert(
            segments.map((segment) => ({
              ...segment,
              transcription_id: transcriptionId,
              session_id: sessionId,
            })),
          )
          .select("*")
          .order("segment_index", { ascending: true }),
      "insertTranscriptionSegments",
    );
  }

  /** @param {string} sessionId */
  async getSegments(sessionId) {
    return this._run(
      () =>
        this._db
          .from("transcription_segments")
          .select("*")
          .eq("session_id", sessionId)
          .order("segment_index", { ascending: true }),
      "getTranscriptionSegments",
    );
  }

  /**
   * Returns jobs stuck in processing state beyond the cutoff.
   *
   * @param {number} staleMinutes
   */
  async findStaleProcessingJobs(staleMinutes) {
    const cutoff = new Date(Date.now() - staleMinutes * 60_000).toISOString();
    return this._run(
      () =>
        this._db
          .from("scribe_processing_queue")
          .select("*")
          .eq("job_type", JOB_TYPE.TRANSCRIBE)
          .eq("status", JOB_STATUS.PROCESSING)
          .lte("started_at", cutoff),
      "findStaleTranscriptionJobs",
    );
  }

  /** @param {string} jobId */
  async requeueJob(jobId) {
    return this._run(
      () =>
        this._db
          .from("scribe_processing_queue")
          .update({
            status: JOB_STATUS.PENDING,
            error: "Recovered stale processing job",
            scheduled_at: new Date().toISOString(),
            locked_at: null,
            locked_by: null,
            last_heartbeat_at: null,
          })
          .eq("id", jobId)
          .select("*")
          .single(),
      "requeueTranscriptionJob",
    );
  }
}

/** @param {number} attemptCount */
function retryDelayMs(attemptCount) {
  const minutes = [1, 5, 30][Math.max(0, Math.min(2, attemptCount - 1))];
  return minutes * 60_000;
}
