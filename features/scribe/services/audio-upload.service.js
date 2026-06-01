/**
 * @fileoverview AudioUploadService — production upload lifecycle for
 * consultation recordings.
 *
 * Responsibilities:
 *  - Create the scribe session after the browser recording stops
 *  - Move session CREATED → RECORDING → UPLOADING
 *  - Create short-lived signed upload URLs for a private Supabase bucket
 *  - Register and confirm chunk metadata in Postgres
 *  - Support retry by issuing new signed URLs for failed/unconfirmed chunks
 *  - Finalize UPLOADING → UPLOADED after every expected chunk is confirmed
 *
 * It intentionally does not enqueue transcription or call OpenAI.
 */

import { extname } from "node:path";
import { createLogger } from "../logger.js";
import {
  AUDIT_ACTION,
  SCRIBE_STORAGE,
  SESSION_STATUS,
} from "../constants.js";
import {
  ConfirmAudioChunkSchema,
  FinalizeAudioUploadSchema,
  RetryAudioUploadSchema,
  StartAudioUploadSchema,
} from "../schemas.js";
import {
  InvalidStateTransitionError,
  SessionNotFoundError,
  SessionValidationError,
  StorageError,
  UploadExpiredError,
  UploadIntegrityError,
  UploadNotReadyError,
  UploadValidationError,
} from "../errors.js";

/** @typedef {import("../repository/session.repository.js").SessionRepository} SessionRepository */
/** @typedef {import("./audit.service.js").AuditService} AuditService */
/** @typedef {import("./session.service.js").ScribeSessionService} ScribeSessionService */
/** @typedef {import("../models/session.model.js").RequestContext} RequestContext */

export class AudioUploadService {
  /**
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   * @param {SessionRepository} sessionRepository
   * @param {AuditService} auditService
   * @param {ScribeSessionService} sessionService
   */
  constructor(supabase, sessionRepository, auditService, sessionService) {
    this._db = supabase;
    this._repo = sessionRepository;
    this._audit = auditService;
    this._sessionService = sessionService;
    this._log = createLogger({ component: "AudioUploadService" });
  }

  /**
   * Creates a session and returns signed upload URLs for each chunk.
   *
   * @param {Record<string, unknown>} rawInput
   * @param {RequestContext} ctx
   * @returns {Promise<{ session: unknown; bucket: string; uploadPrefix: string; uploads: Array<{ chunk_index: number; path: string; token: string; signedUrl: string; expiresAt: string; method: "uploadToSignedUrl" }> }>}
   */
  async startUpload(rawInput, ctx) {
    const parsed = StartAudioUploadSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    const session = await this._sessionService.createSession(
      {
        patient_id: input.patient_id,
        appointment_id: input.appointment_id,
        language: input.language,
      },
      ctx,
    );

    const recording = await this._sessionService.transitionState(
      session.id,
      { to_status: SESSION_STATUS.RECORDING, metadata: { source: "audio_upload_start" } },
      ctx,
    );

    const uploading = await this._sessionService.transitionState(
      recording.id,
      { to_status: SESSION_STATUS.UPLOADING, metadata: { source: "audio_upload_start" } },
      ctx,
    );

    const expiresAt = new Date(
      Date.now() + SCRIBE_STORAGE.SIGNED_UPLOAD_TTL_SECONDS * 1000,
    ).toISOString();

    const uploadPrefix = SCRIBE_STORAGE.buildPrefix(ctx.clinicId, ctx.doctorId, session.id);
    const manifest = input.chunks.map((chunk) => {
      const extension = extensionForMimeType(chunk.mime_type);
      return {
        session_id: session.id,
        chunk_index: chunk.chunk_index,
        storage_path: SCRIBE_STORAGE.buildChunkPath(uploadPrefix, chunk.chunk_index, extension),
        size_bytes: chunk.size_bytes,
        duration_ms: chunk.duration_ms,
        checksum: chunk.checksum ?? null,
        mime_type: chunk.mime_type,
        signed_url_expires_at: expiresAt,
      };
    });

    await this._repo.update(session.id, ctx.doctorId, {
      audio_storage_prefix: uploadPrefix,
      audio_total_chunks: manifest.length,
      audio_duration_seconds: input.audio_duration_seconds,
      audio_size_bytes: input.audio_size_bytes,
      audio_confirmed_chunks: 0,
      upload_progress: 1,
      error_message: null,
    });

    const chunks = await this._repo.upsertUploadChunks(manifest);
    const uploads = await Promise.all(
      chunks.map((chunk) => this._createSignedUpload(chunk.storage_path, true, expiresAt)),
    );

    await this._audit.log({
      action: AUDIT_ACTION.UPLOAD_STARTED,
      sessionId: session.id,
      ctx,
      metadata: {
        chunkCount: manifest.length,
        audioSizeBytes: input.audio_size_bytes,
        durationSeconds: input.audio_duration_seconds,
      },
    });

    this._log.info("Audio upload started", {
      sessionId: session.id,
      clinicId: ctx.clinicId,
      doctorId: ctx.doctorId,
      chunks: manifest.length,
    });

    return {
      session: uploading,
      bucket: SCRIBE_STORAGE.BUCKET,
      uploadPrefix,
      uploads,
    };
  }

  /**
   * Confirms one chunk after the browser uploaded it to Supabase Storage.
   * The method is idempotent for already confirmed chunks.
   *
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {RequestContext} ctx
   */
  async confirmChunk(sessionId, rawInput, ctx) {
    const session = await this._getUploadableSession(sessionId, ctx);

    const parsed = ConfirmAudioChunkSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    const chunk = await this._repo.findChunk(sessionId, input.chunk_index);
    if (!chunk) throw new UploadValidationError("Unknown audio chunk");

    if (chunk.confirmed) {
      return { session, chunk, alreadyConfirmed: true };
    }

    if (chunk.signed_url_expires_at && new Date(chunk.signed_url_expires_at) < new Date()) {
      await this._repo.markChunkFailed(sessionId, input.chunk_index, "Signed upload URL expired");
      throw new UploadExpiredError();
    }

    if (input.size_bytes !== chunk.size_bytes) {
      await this._repo.markChunkFailed(sessionId, input.chunk_index, "Uploaded chunk size mismatch");
      throw new UploadIntegrityError("Uploaded chunk size does not match the original manifest");
    }

    if (chunk.checksum && input.checksum && chunk.checksum !== input.checksum) {
      await this._repo.markChunkFailed(sessionId, input.chunk_index, "Uploaded chunk checksum mismatch");
      throw new UploadIntegrityError("Uploaded chunk checksum does not match the original manifest");
    }

    const exists = await this._storageObjectExists(chunk.storage_path);
    if (!exists) {
      await this._repo.markChunkFailed(sessionId, input.chunk_index, "Storage object not found");
      throw new UploadNotReadyError("Storage object was not found. Retry this chunk upload.");
    }

    const uploadedChunk = await this._repo.markChunkUploaded(sessionId, input.chunk_index);
    await this._repo.incrementConfirmedChunks(sessionId, session.audio_total_chunks ?? 1);
    const updatedSession = await this._repo.findById(sessionId, ctx.doctorId);

    await this._audit.log({
      action: AUDIT_ACTION.UPLOAD_CHUNK_CONFIRMED,
      sessionId,
      ctx,
      metadata: {
        chunkIndex: input.chunk_index,
        sizeBytes: input.size_bytes,
      },
    });

    return {
      session: updatedSession,
      chunk: uploadedChunk,
      alreadyConfirmed: false,
    };
  }

  /**
   * Issues new signed upload URLs for failed or still-unconfirmed chunks.
   *
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {RequestContext} ctx
   */
  async retryUpload(sessionId, rawInput, ctx) {
    await this._getUploadableSession(sessionId, ctx);

    const parsed = RetryAudioUploadSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    const chunks = await this._repo.getChunks(sessionId);
    const retryable = chunks.filter((chunk) => {
      const requested = !input.chunk_indexes || input.chunk_indexes.includes(chunk.chunk_index);
      return requested && !chunk.confirmed;
    });

    if (!retryable.length) {
      throw new UploadNotReadyError("No retryable chunks found for this session");
    }

    const expiresAt = new Date(
      Date.now() + SCRIBE_STORAGE.SIGNED_UPLOAD_TTL_SECONDS * 1000,
    ).toISOString();

    for (const chunk of retryable) {
      await this._repo.incrementChunkAttempt(sessionId, chunk.chunk_index);
      await this._repo.markChunkSigned(sessionId, chunk.chunk_index, expiresAt);
    }

    const uploads = await Promise.all(
      retryable.map((chunk) => this._createSignedUpload(chunk.storage_path, true, expiresAt)),
    );

    await this._audit.log({
      action: AUDIT_ACTION.UPLOAD_RETRY_REQUESTED,
      sessionId,
      ctx,
      metadata: {
        chunkIndexes: retryable.map((chunk) => chunk.chunk_index),
      },
    });

    return {
      bucket: SCRIBE_STORAGE.BUCKET,
      uploads,
    };
  }

  /**
   * Finalizes the session once all expected chunks are confirmed.
   * Does not enqueue transcription.
   *
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {RequestContext} ctx
   */
  async finalizeUpload(sessionId, rawInput, ctx) {
    const session = await this._getUploadableSession(sessionId, ctx);

    const parsed = FinalizeAudioUploadSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const input = parsed.data;

    const chunks = await this._repo.getChunks(sessionId);
    const expected = session.audio_total_chunks ?? chunks.length;
    const confirmed = chunks.filter((chunk) => chunk.confirmed);

    if (chunks.length !== expected || confirmed.length !== expected) {
      throw new UploadNotReadyError(
        `Upload is not complete. Confirmed ${confirmed.length}/${expected} chunks.`,
      );
    }

    const totalBytes = chunks.reduce((sum, chunk) => sum + chunk.size_bytes, 0);
    if (totalBytes !== input.audio_size_bytes) {
      throw new UploadIntegrityError("Final audio size does not match uploaded chunks");
    }

    const finalized = await this._repo.finalizeUpload(sessionId, ctx.doctorId, {
      total_chunks: expected,
      audio_duration_seconds: input.audio_duration_seconds,
      audio_size_bytes: input.audio_size_bytes,
    });

    await this._audit.log({
      action: AUDIT_ACTION.UPLOAD_FINALIZED,
      sessionId,
      ctx,
      metadata: {
        totalChunks: expected,
        audioSizeBytes: input.audio_size_bytes,
        durationSeconds: input.audio_duration_seconds,
      },
    });

    this._log.info("Audio upload finalized", {
      sessionId,
      chunks: expected,
      bytes: input.audio_size_bytes,
    });

    return finalized;
  }

  /**
   * @param {string} sessionId
   * @param {RequestContext} ctx
   */
  async _getUploadableSession(sessionId, ctx) {
    const session = await this._repo.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    if (session.status !== SESSION_STATUS.UPLOADING) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.UPLOADING);
    }

    return session;
  }

  /**
   * Creates a short-lived signed upload URL for the private scribe bucket.
   *
   * @param {string} storagePath
   * @param {boolean} upsert
   * @param {string} expiresAt
   */
  async _createSignedUpload(storagePath, upsert, expiresAt) {
    const { data, error } = await this._db.storage
      .from(SCRIBE_STORAGE.BUCKET)
      .createSignedUploadUrl(storagePath, { upsert });

    if (error || !data?.token) {
      throw new StorageError("createSignedUploadUrl", error);
    }

    return {
      chunk_index: chunkIndexFromPath(storagePath),
      path: storagePath,
      token: data.token,
      signedUrl: data.signedUrl,
      expiresAt,
      method: "uploadToSignedUrl",
    };
  }

  /**
   * Verifies that an uploaded object exists in the private storage bucket.
   *
   * @param {string} storagePath
   * @returns {Promise<boolean>}
   */
  async _storageObjectExists(storagePath) {
    const lastSlash = storagePath.lastIndexOf("/");
    const directory = storagePath.slice(0, lastSlash);
    const filename = storagePath.slice(lastSlash + 1);

    const { data, error } = await this._db.storage
      .from(SCRIBE_STORAGE.BUCKET)
      .list(directory, { limit: 100, search: filename });

    if (error) throw new StorageError("list uploaded object", error);
    return (data ?? []).some((item) => item.name === filename);
  }
}

/**
 * @param {string} mimeType
 * @returns {string}
 */
function extensionForMimeType(mimeType) {
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("ogg")) return "ogg";
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("mpeg")) return "mp3";
  if (mimeType.includes("wav")) return "wav";
  if (mimeType.includes("aac")) return "aac";
  return "webm";
}

/**
 * @param {string} storagePath
 * @returns {number}
 */
function chunkIndexFromPath(storagePath) {
  const base = storagePath.slice(storagePath.lastIndexOf("/") + 1);
  const stem = extname(base) ? base.slice(0, -extname(base).length) : base;
  return Number.parseInt(stem, 10);
}
