/**
 * @fileoverview PrescriptionReviewService — doctor-facing inline editing,
 * autosave, versioning, approval, and rejection of prescription drafts.
 *
 * State machine owned here:
 *   PRESCRIPTION_DRAFT_READY
 *     → PRESCRIPTION_REVIEW_REQUIRED  (on getWorkspace, first open)
 *     → PRESCRIPTION_REVIEWING         (on getWorkspace, review opened)
 *     → PRESCRIPTION_APPROVED          (on approve)
 *     → SOAP_APPROVED                  (on reject with regenerate=true)
 *     → PRESCRIPTION_REVIEW_REQUIRED   (on reject without regenerate)
 *
 * Audit trail:
 *   Every field edit, save, approve, and reject is logged in
 *   prescription_review_events.
 */

import {
  AUDIT_ACTION,
  PRESCRIPTION_DRAFT_STATUS,
  PRESCRIPTION_GENERATION_CONFIG,
  PRESCRIPTION_REVIEW_STATUS,
  SESSION_STATUS,
} from "../constants.js";
import {
  InvalidStateTransitionError,
  PrescriptionNotReadyError,
  PrescriptionReviewError,
  SessionNotFoundError,
  SessionValidationError,
} from "../errors.js";
import {
  ApprovePrescriptionSchema,
  RejectPrescriptionSchema,
  SavePrescriptionVersionSchema,
  UpdatePrescriptionDraftSchema,
} from "../schemas.js";
import { createLogger } from "../logger.js";

export class PrescriptionReviewService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository}         sessionRepository
   * @param {import("../repository/prescription.repository.js").PrescriptionRepository} prescriptionRepository
   * @param {import("./audit.service.js").AuditService}                                auditService
   */
  constructor(sessionRepository, prescriptionRepository, auditService) {
    this._sessions      = sessionRepository;
    this._prescriptions = prescriptionRepository;
    this._audit         = auditService;
    this._log           = createLogger({ component: "PrescriptionReviewService" });
  }

  // ─────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns the full review workspace. Advances the session through
   * PRESCRIPTION_DRAFT_READY → PRESCRIPTION_REVIEW_REQUIRED → PRESCRIPTION_REVIEWING
   * on first open.
   *
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async getWorkspace(sessionId, ctx) {
    let session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    let draft = await this._prescriptions.getDraftBySession(sessionId);
    if (!draft) {
      throw new PrescriptionNotReadyError(
        "No prescription draft found. Generate a prescription first.",
      );
    }

    // ── Advance through the status funnel on first open ─────────────────

    if (session.status === SESSION_STATUS.PRESCRIPTION_DRAFT_READY) {
      session = await this._sessions.transitionStatus(
        sessionId, ctx.doctorId,
        SESSION_STATUS.PRESCRIPTION_DRAFT_READY,
        SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED,
      );
      draft = await this._prescriptions.updateDraftFields(draft.id, {
        status: PRESCRIPTION_DRAFT_STATUS.REVIEW_REQUIRED,
      });
    }

    if (session.status === SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED) {
      session = await this._sessions.transitionStatus(
        sessionId, ctx.doctorId,
        SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED,
        SESSION_STATUS.PRESCRIPTION_REVIEWING,
      );
      draft = await this._prescriptions.updateDraftFields(draft.id, {
        status:            PRESCRIPTION_DRAFT_STATUS.REVIEWING,
        reviewer_id:       ctx.actorId,
        review_started_at: new Date().toISOString(),
        // Snapshot original draft once (never overwrite after the first time)
        original_draft:    draft.original_draft ?? draft.draft,
      });
    }

    // Guard: must be in PRESCRIPTION_REVIEWING (or already APPROVED)
    if (
      session.status !== SESSION_STATUS.PRESCRIPTION_REVIEWING &&
      session.status !== SESSION_STATUS.PRESCRIPTION_APPROVED
    ) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.PRESCRIPTION_REVIEWING);
    }

    // ── Ensure a review record exists ────────────────────────────────────
    let review = await this._prescriptions.getReviewByDraft(draft.id);
    if (!review) {
      review = await this._prescriptions.createReview({
        session_id:            sessionId,
        prescription_draft_id: draft.id,
        clinic_id:             ctx.clinicId,
        doctor_id:             ctx.doctorId,
        reviewer_id:           ctx.actorId,
        status:                PRESCRIPTION_REVIEW_STATUS.REVIEWING,
      });

      await this._prescriptions.insertReviewEvent({
        session_id:            sessionId,
        prescription_draft_id: draft.id,
        review_id:             review.id,
        clinic_id:             ctx.clinicId,
        actor_id:              ctx.actorId,
        event_type:            "review_started",
        metadata:              { reviewerId: ctx.actorId },
      });

      await this._audit.log({
        action:    AUDIT_ACTION.PRESCRIPTION_REVIEW_STARTED,
        sessionId,
        ctx,
        metadata:  { draftId: draft.id, reviewId: review.id },
      });
    }

    const [versions, events] = await Promise.all([
      this._prescriptions.getVersions(sessionId),
      this._prescriptions.getReviewEvents(sessionId),
    ]);

    return { session, draft, review, versions, events };
  }

  /**
   * Applies an inline edit (autosave or manual). Replaces the entire draft
   * JSONB and logs an audit event with the diff summary.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput  { draft, source }
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async updateDraft(sessionId, rawInput, ctx) {
    const parsed = UpdatePrescriptionDraftSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const { draft: newDraftData, source } = parsed.data;

    const { draft, review } = await this._assertReviewing(sessionId, ctx);

    const before = draft.draft;
    const diff   = computeDiff(draft.original_draft ?? before, newDraftData);

    const updated = await this._prescriptions.updateDraftFields(draft.id, {
      draft:               newDraftData,
      modification_summary: diff,
    });

    await this._prescriptions.insertReviewEvent({
      session_id:            sessionId,
      prescription_draft_id: draft.id,
      review_id:             review?.id ?? null,
      clinic_id:             ctx.clinicId,
      actor_id:              ctx.actorId,
      event_type:            source === "autosave" ? "autosave" : "field_update",
      before_value:          before,
      after_value:           newDraftData,
      metadata:              { source, changedFields: diff.changedFields },
    });

    if (source !== "autosave") {
      await this._audit.log({
        action:    AUDIT_ACTION.PRESCRIPTION_FIELD_EDITED,
        sessionId,
        ctx,
        metadata:  { draftId: draft.id, source, changedFields: diff.changedFields },
      });
    }

    return updated;
  }

  /**
   * Creates an immutable version snapshot of the current draft.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput  { source, label? }
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async saveVersion(sessionId, rawInput, ctx) {
    const parsed = SavePrescriptionVersionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const { draft, review } = await this._assertReviewing(sessionId, ctx);
    const version = await this._createVersionSnapshot(draft, ctx, parsed.data);

    await this._prescriptions.insertReviewEvent({
      session_id:            sessionId,
      prescription_draft_id: draft.id,
      review_id:             review?.id ?? null,
      clinic_id:             ctx.clinicId,
      actor_id:              ctx.actorId,
      event_type:            "version_created",
      version_id:            version.id,
      metadata:              { versionNumber: version.version_number, source: parsed.data.source },
    });

    await this._audit.log({
      action:    AUDIT_ACTION.PRESCRIPTION_SAVED,
      sessionId,
      ctx,
      metadata:  { draftId: draft.id, versionId: version.id, versionNumber: version.version_number },
    });

    return version;
  }

  /**
   * Approves the prescription draft.
   * Creates a version snapshot, locks the draft, and transitions the session.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput  { create_version? }
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async approve(sessionId, rawInput, ctx) {
    const parsed = ApprovePrescriptionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const { session, draft, review } = await this._assertReviewing(sessionId, ctx);

    let version = null;
    if (parsed.data.create_version) {
      version = await this._createVersionSnapshot(draft, ctx, { source: "approved" });
    }

    const approvedAt = new Date().toISOString();

    const updatedDraft = await this._prescriptions.updateDraftFields(draft.id, {
      status:               PRESCRIPTION_DRAFT_STATUS.APPROVED,
      approved_at:          approvedAt,
      approved_by:          ctx.actorId,
      modification_summary: computeDiff(draft.original_draft ?? draft.draft, draft.draft),
    });

    if (review) {
      await this._prescriptions.updateReview(review.id, {
        status:                    PRESCRIPTION_REVIEW_STATUS.APPROVED,
        approved_at:               approvedAt,
        approved_by:               ctx.actorId,
        version_number_at_approval: version?.version_number ?? null,
        changes_summary:           computeDiff(draft.original_draft ?? draft.draft, draft.draft),
      });
    }

    const updatedSession = await this._sessions.transitionStatus(
      sessionId, ctx.doctorId,
      session.status,
      SESSION_STATUS.PRESCRIPTION_APPROVED,
    );

    await this._prescriptions.insertReviewEvent({
      session_id:            sessionId,
      prescription_draft_id: draft.id,
      review_id:             review?.id ?? null,
      clinic_id:             ctx.clinicId,
      actor_id:              ctx.actorId,
      event_type:            "approved",
      version_id:            version?.id ?? null,
      before_value:          { status: draft.status },
      after_value:           { status: PRESCRIPTION_DRAFT_STATUS.APPROVED },
      metadata:              { approvedAt, versionId: version?.id ?? null },
    });

    await this._audit.log({
      action:    AUDIT_ACTION.PRESCRIPTION_APPROVED,
      sessionId,
      ctx,
      metadata:  {
        draftId:   draft.id,
        versionId: version?.id ?? null,
        reviewId:  review?.id ?? null,
      },
    });

    return { session: updatedSession, draft: updatedDraft, review, version };
  }

  /**
   * Rejects the prescription draft.
   * If regenerate=true, session rolls back to SOAP_APPROVED for a fresh generation.
   * Otherwise, session stays at PRESCRIPTION_REVIEW_REQUIRED for editing.
   *
   * @param {string}                 sessionId
   * @param {Record<string,unknown>} rawInput  { reason, regenerate? }
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async reject(sessionId, rawInput, ctx) {
    const parsed = RejectPrescriptionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const { reason, regenerate } = parsed.data;

    const { session, draft, review } = await this._assertReviewing(sessionId, ctx);

    const rejectedAt  = new Date().toISOString();
    const nextSessionStatus = regenerate
      ? SESSION_STATUS.SOAP_APPROVED
      : SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED;

    const updatedDraft = await this._prescriptions.updateDraftFields(draft.id, {
      status:           PRESCRIPTION_DRAFT_STATUS.REJECTED,
      rejected_at:      rejectedAt,
      rejection_reason: reason,
    });

    if (review) {
      await this._prescriptions.updateReview(review.id, {
        status:           PRESCRIPTION_REVIEW_STATUS.REJECTED,
        rejected_at:      rejectedAt,
        rejection_reason: reason,
      });
    }

    const updatedSession = await this._sessions.transitionStatus(
      sessionId, ctx.doctorId,
      session.status,
      nextSessionStatus,
    );

    await this._prescriptions.insertReviewEvent({
      session_id:            sessionId,
      prescription_draft_id: draft.id,
      review_id:             review?.id ?? null,
      clinic_id:             ctx.clinicId,
      actor_id:              ctx.actorId,
      event_type:            "rejected",
      before_value:          { status: draft.status },
      after_value:           { status: PRESCRIPTION_DRAFT_STATUS.REJECTED },
      metadata:              { reason, regenerate, rejectedAt },
    });

    await this._audit.log({
      action:    AUDIT_ACTION.PRESCRIPTION_REJECTED,
      sessionId,
      ctx,
      metadata:  {
        draftId:    draft.id,
        reason,
        regenerate,
        reviewId:   review?.id ?? null,
        nextStatus: nextSessionStatus,
      },
    });

    return { session: updatedSession, draft: updatedDraft, review };
  }

  // ─────────────────────────────────────────────────────────────
  // PRIVATE
  // ─────────────────────────────────────────────────────────────

  /**
   * Creates an immutable version snapshot of the current draft state.
   *
   * @param {Record<string,unknown>} draft
   * @param {import("../models/session.model.js").RequestContext} ctx
   * @param {{ source?: string; label?: string }} opts
   */
  async _createVersionSnapshot(draft, ctx, opts = {}) {
    const versionNumber = await this._prescriptions.getNextVersionNumber(draft.id);
    const version = await this._prescriptions.createVersion({
      prescription_draft_id: draft.id,
      session_id:            draft.session_id,
      soap_note_id:          draft.soap_note_id,
      clinic_id:             ctx.clinicId,
      doctor_id:             ctx.doctorId,
      version_number:        versionNumber,
      draft:                 draft.draft,
      provider:              draft.provider,
      model:                 draft.model,
      prompt_version:        draft.prompt_version,
      input_hash:            draft.input_hash,
      generation_metadata:   {
        ...(draft.generation_metadata ?? {}),
        savedAt: new Date().toISOString(),
        source:  opts.source ?? "manual_save",
        label:   opts.label  ?? null,
      },
      created_by:            ctx.actorId,
    });

    await this._audit.log({
      action:    AUDIT_ACTION.PRESCRIPTION_VERSION_CREATED,
      sessionId: draft.session_id,
      ctx,
      metadata:  { draftId: draft.id, versionId: version.id, versionNumber },
    });

    return version;
  }

  /**
   * Asserts the session is in PRESCRIPTION_REVIEWING and returns the draft.
   *
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async _assertReviewing(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    if (session.status !== SESSION_STATUS.PRESCRIPTION_REVIEWING) {
      throw new PrescriptionReviewError(
        `Session is not in PRESCRIPTION_REVIEWING state (current: ${session.status}). Open the review workspace first.`,
      );
    }

    const draft = await this._prescriptions.getDraftBySession(sessionId);
    if (!draft) {
      throw new PrescriptionNotReadyError("No prescription draft found for this session.");
    }

    const review = await this._prescriptions.getReviewByDraft(draft.id);
    return { session, draft, review };
  }
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Computes a high-level diff summary between the original and current draft.
 * Used for modification_summary and changes_summary columns.
 *
 * @param {Record<string,unknown>|null} original
 * @param {Record<string,unknown>}      current
 */
function computeDiff(original, current) {
  if (!original) return { changedFields: [], totalChanges: 0, computedAt: new Date().toISOString() };

  const changedFields = [];

  const origMeds  = original.medications  ?? [];
  const currMeds  = current.medications   ?? [];
  if (JSON.stringify(origMeds) !== JSON.stringify(currMeds)) changedFields.push("medications");

  const origDx    = original.diagnosis    ?? [];
  const currDx    = current.diagnosis     ?? [];
  if (JSON.stringify(origDx) !== JSON.stringify(currDx)) changedFields.push("diagnosis");

  if ((original.followUpInstructions ?? "") !== (current.followUpInstructions ?? "")) {
    changedFields.push("followUpInstructions");
  }

  const origInv = original.investigations ?? [];
  const currInv = current.investigations  ?? [];
  if (JSON.stringify(origInv) !== JSON.stringify(currInv)) changedFields.push("investigations");

  const origAdv = original.advice ?? [];
  const currAdv = current.advice  ?? [];
  if (JSON.stringify(origAdv) !== JSON.stringify(currAdv)) changedFields.push("advice");

  const origWarn = original.warnings ?? [];
  const currWarn = current.warnings  ?? [];
  if (JSON.stringify(origWarn) !== JSON.stringify(currWarn)) changedFields.push("warnings");

  return {
    changedFields,
    totalChanges:   changedFields.length,
    medicationCount: currMeds.length,
    computedAt:     new Date().toISOString(),
  };
}
