"use client";

/**
 * @fileoverview Browser-side upload orchestrator for completed recordings.
 *
 * This service is intentionally small and reusable:
 *  1. POST manifest to /api/scribe/uploads/start
 *  2. Upload each Blob directly to the private Supabase bucket using
 *     uploadToSignedUrl(path, token, blob)
 *  3. Confirm each chunk with the server
 *  4. Finalize the session once all chunks are confirmed
 *
 * Audio files remain private. The browser receives write-only signed upload
 * tokens, never public read URLs.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * @typedef {Object} UploadRecordingOptions
 * @property {Blob[]} chunks
 * @property {number} audioDurationSeconds
 * @property {string} [patientId]
 * @property {string} [appointmentId]
 * @property {string} [language]
 * @property {number} [maxRetries]
 * @property {(event: UploadProgressEvent) => void} [onProgress]
 */

/**
 * @typedef {Object} UploadProgressEvent
 * @property {"starting"|"uploading"|"confirming"|"finalizing"|"completed"|"retrying"} phase
 * @property {number} chunkIndex
 * @property {number} uploadedChunks
 * @property {number} totalChunks
 * @property {number} progress
 * @property {string} [sessionId]
 */

/**
 * Uploads a completed recording to private Supabase Storage.
 *
 * @param {UploadRecordingOptions} options
 */
export async function uploadCompletedRecording(options) {
  const {
    chunks,
    audioDurationSeconds,
    patientId,
    appointmentId,
    language = "hinglish",
    maxRetries = 2,
    onProgress,
  } = options;

  if (!Array.isArray(chunks) || chunks.length === 0) {
    throw new Error("No audio chunks provided for upload");
  }

  const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
  const durationPerChunk = Math.round((audioDurationSeconds * 1000) / chunks.length);

  onProgress?.(progressEvent("starting", 0, 0, chunks.length));

  const manifest = {
    patient_id: patientId ?? null,
    appointment_id: appointmentId ?? null,
    language,
    audio_duration_seconds: audioDurationSeconds,
    audio_size_bytes: totalBytes,
    chunks: chunks.map((chunk, index) => ({
      chunk_index: index,
      size_bytes: chunk.size,
      duration_ms: durationPerChunk,
      mime_type: chunk.type || "audio/webm",
      checksum: null,
    })),
  };

  const start = await startUploadWithRetry(manifest);

  const sessionId = start.session.id;
  let uploadMap = new Map(start.uploads.map((upload) => [upload.chunk_index, upload]));
  const supabase = getSupabaseBrowserClient();

  let uploadedChunks = 0;

  for (let index = 0; index < chunks.length; index++) {
    let upload = uploadMap.get(index);
    if (!upload) {
      throw new Error(`Missing signed upload URL for chunk ${index}`);
    }

    let attempts = 0;
    while (attempts <= maxRetries) {
      attempts += 1;
      onProgress?.(progressEvent(
        attempts === 1 ? "uploading" : "retrying",
        index,
        uploadedChunks,
        chunks.length,
        sessionId,
      ));

      const { error: uploadError } = await supabase.storage
        .from(start.bucket)
        .uploadToSignedUrl(upload.path, upload.token, chunks[index], {
          contentType: chunks[index].type || "audio/webm",
          upsert: true,
        });

      if (!uploadError) break;
      if (attempts > maxRetries) throw uploadError;

      const retry = await postJson(`/api/scribe/sessions/${sessionId}/uploads/retry`, {
        chunk_indexes: [index],
      });
      uploadMap = new Map(retry.uploads.map((nextUpload) => [nextUpload.chunk_index, nextUpload]));
      upload = uploadMap.get(index);
      await sleep(500 * attempts);
    }

    onProgress?.(progressEvent("confirming", index, uploadedChunks, chunks.length, sessionId));

    await postJson(`/api/scribe/sessions/${sessionId}/uploads/confirm`, {
      chunk_index: index,
      size_bytes: chunks[index].size,
      checksum: null,
    });

    uploadedChunks += 1;
    onProgress?.(progressEvent("uploading", index, uploadedChunks, chunks.length, sessionId));
  }

  onProgress?.(progressEvent("finalizing", chunks.length - 1, uploadedChunks, chunks.length, sessionId));

  const finalized = await postJson(`/api/scribe/sessions/${sessionId}/uploads/finalize`, {
    audio_duration_seconds: audioDurationSeconds,
    audio_size_bytes: totalBytes,
  });

  onProgress?.(progressEvent("completed", chunks.length - 1, chunks.length, chunks.length, sessionId));

  return finalized;
}

/**
 * @param {string} phase
 * @param {number} chunkIndex
 * @param {number} uploadedChunks
 * @param {number} totalChunks
 * @param {string} [sessionId]
 * @returns {UploadProgressEvent}
 */
function progressEvent(phase, chunkIndex, uploadedChunks, totalChunks, sessionId) {
  return {
    phase,
    chunkIndex,
    uploadedChunks,
    totalChunks,
    progress: totalChunks === 0 ? 0 : Math.round((uploadedChunks / totalChunks) * 100),
    ...(sessionId ? { sessionId } : {}),
  };
}

/**
 * @param {string} url
 * @param {Record<string, unknown>} body
 */
async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    const message = payload?.error ?? `Request failed with ${res.status}`;
    const err = new Error(message);
    err.code = payload?.code;
    err.details = payload?.details;
    throw err;
  }

  return payload;
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts upload; on SESSION_ALREADY_ACTIVE releases blocking sessions and retries once.
 */
async function startUploadWithRetry(manifest) {
  try {
    return await postJson("/api/scribe/uploads/start", manifest);
  } catch (err) {
    if (err?.code === "SESSION_ALREADY_ACTIVE") {
      await postJson("/api/scribe/sessions/release-blocking", {});
      return await postJson("/api/scribe/uploads/start", manifest);
    }
    throw err;
  }
}
