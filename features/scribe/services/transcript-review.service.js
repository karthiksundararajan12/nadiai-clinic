/**
 * @fileoverview TranscriptReviewService — business logic for doctor review
 * and correction before SOAP generation.
 */

import {
  AUDIT_ACTION,
  SESSION_STATUS,
  TRANSCRIPT_READONLY_SESSION_STATUSES,
} from "../constants.js";
import { resolveTranscriptWorkspaceAccess } from "../lib/transcript-workspace-policy.js";
import {
  InvalidStateTransitionError,
  SessionFinalizedError,
  SessionNotFoundError,
  SessionValidationError,
  TranscriptionNotReadyError,
} from "../errors.js";
import {
  CompleteReviewSchema,
  RestoreTranscriptVersionSchema,
  ReviewSegmentUpdateSchema,
  SaveTranscriptVersionSchema,
} from "../schemas.js";
import { createLogger } from "../logger.js";

export class TranscriptReviewService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/transcript-review.repository.js").TranscriptReviewRepository} reviewRepository
   * @param {import("./audit.service.js").AuditService} auditService
   */
  constructor(sessionRepository, reviewRepository, auditService) {
    this._sessions = sessionRepository;
    this._review = reviewRepository;
    this._audit = auditService;
    this._log = createLogger({ component: "TranscriptReviewService" });
  }

  /** @param {string} sessionId @param {import("../models/session.model.js").RequestContext} ctx */
  async getWorkspace(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    const access = resolveTranscriptWorkspaceAccess(session.status);
    if (access.mode === "unavailable") {
      throw new TranscriptionNotReadyError(
        `Transcript is not available for session status '${session.status}'`,
      );
    }

    if (access.transitionToReviewing) {
      await this._sessions.transitionStatus(
        session.id,
        ctx.doctorId,
        SESSION_STATUS.TRANSCRIBED,
        SESSION_STATUS.REVIEWING,
      );
      await this._audit.log({
        action: AUDIT_ACTION.REVIEW_STARTED,
        sessionId,
        ctx,
        metadata: {},
      });
    }

    const nextSession = await this._sessions.findById(sessionId, ctx.doctorId);
    const workspace = await this._review.getWorkspace(sessionId);
    return { session: nextSession, ...workspace, readOnly: access.readOnly };
  }

  /**
   * @param {string} sessionId
   * @param {string} segmentId
   * @param {Record<string, unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async updateSegment(sessionId, segmentId, rawInput, ctx) {
    const session = await this._assertReviewable(sessionId, ctx);
    const workspace = await this._review.getWorkspace(sessionId);
    const before = workspace.segments.find((segment) => segment.id === segmentId);
    if (!before) throw new SessionNotFoundError(segmentId);

    const parsed = ReviewSegmentUpdateSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const updates = parsed.data;
    const after = await this._review.updateSegment(segmentId, updates);

    await this._review.insertEdit({
      session_id: sessionId,
      transcription_id: workspace.transcription?.id ?? null,
      segment_id: segmentId,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      edit_type: updates.text !== undefined ? "text" : "speaker",
      before_value: pickChanged(before, updates),
      after_value: pickChanged(after, updates),
      metadata: { optimistic: true },
    });

    await this._audit.log({
      action: updates.text !== undefined ? AUDIT_ACTION.TRANSCRIPT_EDITED : AUDIT_ACTION.SPEAKER_CORRECTED,
      sessionId,
      ctx,
      metadata: { segmentId, fields: Object.keys(updates) },
    });

    return after;
  }

  /**
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async createVersion(sessionId, rawInput, ctx) {
    const session = await this._assertReviewable(sessionId, ctx, true);
    const parsed = SaveTranscriptVersionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const workspace = await this._review.getWorkspace(sessionId);
    const versionNumber = await this._review.getNextVersionNumber(sessionId);
    const fullText = workspace.segments.map((segment) => segment.text).join("\n").trim();

    const version = await this._review.createVersion({
      session_id: sessionId,
      transcription_id: workspace.transcription?.id ?? null,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      version_number: versionNumber,
      label: parsed.data.label ?? `Version ${versionNumber}`,
      source: parsed.data.source,
      full_text: fullText,
      segments_snapshot: workspace.segments,
      change_summary: summarizeSegments(workspace.segments),
      created_by: ctx.actorId,
    });

    await this._audit.log({
      action: AUDIT_ACTION.TRANSCRIPT_VERSION_CREATED,
      sessionId,
      ctx,
      metadata: { versionId: version.id, versionNumber, source: parsed.data.source },
    });

    return version;
  }

  /** @param {string} sessionId @param {import("../models/session.model.js").RequestContext} ctx */
  async getVersions(sessionId, ctx) {
    await this._assertReviewable(sessionId, ctx, true);
    return this._review.getVersions(sessionId);
  }

  /**
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async restoreVersion(sessionId, rawInput, ctx) {
    await this._assertReviewable(sessionId, ctx);
    const parsed = RestoreTranscriptVersionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const version = await this._review.getVersion(parsed.data.version_id);
    if (!version || version.session_id !== sessionId) throw new SessionNotFoundError(parsed.data.version_id);

    const segments = await this._review.replaceSegmentsFromSnapshot(sessionId, version.segments_snapshot ?? []);

    await this._review.insertEdit({
      session_id: sessionId,
      transcription_id: version.transcription_id,
      segment_id: null,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      edit_type: "version_restore",
      before_value: null,
      after_value: { version_id: version.id, version_number: version.version_number },
      metadata: {},
    });

    await this._audit.log({
      action: AUDIT_ACTION.TRANSCRIPT_VERSION_RESTORED,
      sessionId,
      ctx,
      metadata: { versionId: version.id, versionNumber: version.version_number },
    });

    return { version, segments };
  }

  /**
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async completeReview(sessionId, rawInput, ctx) {
    const session = await this._assertReviewable(sessionId, ctx);
    const parsed = CompleteReviewSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    let version = null;
    if (parsed.data.create_version) {
      version = await this.createVersion(
        sessionId,
        { source: "review_completed", label: "Review completed" },
        ctx,
      );
    }

    const updated = await this._sessions.transitionStatus(
      sessionId,
      ctx.doctorId,
      session.status,
      SESSION_STATUS.REVIEW_COMPLETED,
    );

    await this._review.insertEdit({
      session_id: sessionId,
      transcription_id: version?.transcription_id ?? null,
      segment_id: null,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      edit_type: "review_completed",
      before_value: { status: session.status },
      after_value: { status: SESSION_STATUS.REVIEW_COMPLETED },
      metadata: { versionId: version?.id ?? null },
    });

    await this._audit.log({
      action: AUDIT_ACTION.REVIEW_COMPLETED,
      sessionId,
      ctx,
      metadata: { versionId: version?.id ?? null },
    });

    return { session: updated, version };
  }

  async _assertReviewable(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    if (TRANSCRIPT_READONLY_SESSION_STATUSES.includes(session.status)) {
      throw new SessionFinalizedError();
    }
    if (![SESSION_STATUS.REVIEWING, SESSION_STATUS.REVIEW_COMPLETED].includes(session.status)) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.REVIEWING);
    }
    return session;
  }
}

function pickChanged(row, updates) {
  return Object.fromEntries(
    Object.keys(updates).map((key) => [key, row[key]]),
  );
}

function summarizeSegments(segments) {
  return {
    segmentCount: segments.length,
    lowConfidenceCount: segments.filter((segment) => segment.is_low_confidence).length,
    speakerCounts: segments.reduce((acc, segment) => {
      acc[segment.speaker_label] = (acc[segment.speaker_label] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
