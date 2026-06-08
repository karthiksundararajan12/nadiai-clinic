/**
 * @fileoverview AudioPlaybackService — signed read URLs for consultation playback.
 */

import { SCRIBE_STORAGE } from "../constants.js";
import { SessionNotFoundError, StorageError, TranscriptionNotReadyError } from "../errors.js";
import { createLogger } from "../logger.js";

export class AudioPlaybackService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("@supabase/supabase-js").SupabaseClient} supabase
   */
  constructor(sessionRepository, supabase) {
    this._sessions = sessionRepository;
    this._db = supabase;
    this._log = createLogger({ component: "AudioPlaybackService" });
  }

  /**
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async getPlaybackManifest(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    const chunks = await this._sessions.getConfirmedChunks(sessionId);
    if (!chunks.length) {
      throw new TranscriptionNotReadyError("No confirmed audio chunks available for playback");
    }

    let offsetSeconds = 0;
    const signedChunks = [];

    for (const chunk of chunks) {
      const { data, error } = await this._db.storage
        .from(SCRIBE_STORAGE.BUCKET)
        .createSignedUrl(chunk.storage_path, 3600);

      if (error || !data?.signedUrl) {
        throw new StorageError("create signed playback URL", error);
      }

      const durationSeconds = (chunk.duration_ms ?? 0) / 1000;
      signedChunks.push({
        chunk_index: chunk.chunk_index,
        url: data.signedUrl,
        mime_type: chunk.mime_type ?? "audio/webm",
        start_seconds: offsetSeconds,
        end_seconds: offsetSeconds + durationSeconds,
        duration_ms: chunk.duration_ms ?? 0,
      });
      offsetSeconds += durationSeconds;
    }

    this._log.info("Playback manifest created", {
      sessionId,
      chunkCount: signedChunks.length,
    });

    return {
      session_id: sessionId,
      duration_seconds: session.audio_duration_seconds ?? offsetSeconds,
      mime_type: signedChunks[0]?.mime_type ?? "audio/webm",
      chunks: signedChunks,
      expires_in_seconds: 3600,
    };
  }
}
