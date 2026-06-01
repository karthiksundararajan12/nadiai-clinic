/**
 * @fileoverview TranscriptReviewRepository — review workspace persistence.
 */

import { BaseRepository } from "./base.repository.js";

export class TranscriptReviewRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "transcription_segments");
  }

  /** @param {string} sessionId */
  async getWorkspace(sessionId) {
    const transcription = await this._runNullable(
      () =>
        this._db
          .from("scribe_transcriptions")
          .select("*")
          .eq("session_id", sessionId)
          .single(),
      "getReviewTranscription",
    );

    const segments = await this._run(
      () =>
        this._db
          .from("transcription_segments")
          .select("*")
          .eq("session_id", sessionId)
          .order("segment_index", { ascending: true }),
      "getReviewSegments",
    );

    const versions = await this.getVersions(sessionId);
    return { transcription, segments, versions };
  }

  /**
   * @param {string} segmentId
   * @param {Record<string, unknown>} updates
   */
  async updateSegment(segmentId, updates) {
    return this._run(
      () =>
        this._db
          .from("transcription_segments")
          .update(updates)
          .eq("id", segmentId)
          .select("*")
          .single(),
      "updateTranscriptSegment",
    );
  }

  /**
   * @param {string} sessionId
   * @param {Array<Record<string, unknown>>} segments
   */
  async replaceSegmentsFromSnapshot(sessionId, segments) {
    const updates = [];
    for (const segment of segments) {
      updates.push(await this.updateSegment(segment.id, {
        text: segment.text,
        speaker: segment.speaker,
        speaker_label: segment.speaker_label,
        confidence: segment.confidence,
        is_low_confidence: segment.is_low_confidence,
      }));
    }
    return updates;
  }

  /**
   * @param {{
   * session_id: string;
   * transcription_id?: string|null;
   * clinic_id: string;
   * doctor_id: string;
   * version_number: number;
   * label?: string|null;
   * source: string;
   * full_text: string;
   * segments_snapshot: Array<Record<string, unknown>>;
   * change_summary?: Record<string, unknown>;
   * created_by: string;
   * }} data
   */
  async createVersion(data) {
    return this._run(
      () =>
        this._db
          .from("transcript_versions")
          .insert(data)
          .select("*")
          .single(),
      "createTranscriptVersion",
    );
  }

  /** @param {string} sessionId */
  async getVersions(sessionId) {
    return this._run(
      () =>
        this._db
          .from("transcript_versions")
          .select("*")
          .eq("session_id", sessionId)
          .order("version_number", { ascending: false }),
      "getTranscriptVersions",
    );
  }

  /** @param {string} versionId */
  async getVersion(versionId) {
    return this._runNullable(
      () =>
        this._db
          .from("transcript_versions")
          .select("*")
          .eq("id", versionId)
          .single(),
      "getTranscriptVersion",
    );
  }

  /** @param {string} sessionId */
  async getNextVersionNumber(sessionId) {
    const latest = await this._runNullable(
      () =>
        this._db
          .from("transcript_versions")
          .select("version_number")
          .eq("session_id", sessionId)
          .order("version_number", { ascending: false })
          .limit(1)
          .single(),
      "getNextTranscriptVersionNumber",
    );
    return (latest?.version_number ?? 0) + 1;
  }

  /** @param {Record<string, unknown>} edit */
  async insertEdit(edit) {
    return this._run(
      () =>
        this._db
          .from("transcript_edits")
          .insert(edit)
          .select("*")
          .single(),
      "insertTranscriptEdit",
    );
  }
}
