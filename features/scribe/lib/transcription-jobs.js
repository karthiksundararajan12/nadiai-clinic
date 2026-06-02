/**
 * @fileoverview In-memory transcription job helpers (queue fallback).
 */

import { JOB_STATUS, JOB_TYPE } from "../constants.js";

/**
 * @param {Record<string, unknown>|null|undefined} job
 * @returns {boolean}
 */
export function isInlineTranscriptionJob(job) {
  if (!job) return false;
  const meta = job.metadata;
  if (meta && typeof meta === "object" && "inline" in meta && meta.inline) return true;
  return String(job.id ?? "").startsWith("inline:");
}

/**
 * @param {string} sessionId
 * @param {number} [priority]
 * @param {{ clinicId: string; doctorId: string }} ctx
 */
export function buildInlineTranscriptionJob(sessionId, priority, ctx) {
  return {
    id:            `inline:${sessionId}`,
    session_id:    sessionId,
    job_type:      JOB_TYPE.TRANSCRIBE,
    priority:      priority ?? 10,
    status:        JOB_STATUS.PENDING,
    attempt_count: 0,
    max_attempts:  3,
    metadata:      { inline: true, clinicId: ctx.clinicId, doctorId: ctx.doctorId },
  };
}

/**
 * @param {Record<string, unknown>} job
 * @param {string} message
 * @param {boolean} retryable
 */
export function failInlineTranscriptionJob(job, message, retryable) {
  const nextAttempt = (job.attempt_count ?? 0) + 1;
  const willRetry   = retryable && nextAttempt < (job.max_attempts ?? 3);
  return {
    ...job,
    status:        willRetry ? JOB_STATUS.PENDING : JOB_STATUS.FAILED,
    attempt_count: nextAttempt,
    error:         message,
  };
}
