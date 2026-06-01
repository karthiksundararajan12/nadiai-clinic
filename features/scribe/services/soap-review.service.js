/**
 * @fileoverview SOAPReviewService — doctor-facing clinical editing,
 * versioning, approval, and rejection workflow for generated SOAP notes.
 */

import { AUDIT_ACTION, SESSION_STATUS, SOAP_NOTE_STATUS } from "../constants.js";
import {
  InvalidStateTransitionError,
  SOAPNotReadyError,
  SessionNotFoundError,
  SessionValidationError,
} from "../errors.js";
import {
  ApproveSOAPNoteSchema,
  CompareSOAPVersionsSchema,
  RejectSOAPNoteSchema,
  SaveSOAPVersionSchema,
  UpdateSOAPSectionSchema,
} from "../schemas.js";
import { createLogger } from "../logger.js";

const SECTION_TO_COLUMN = {
  chiefComplaint: "chief_complaint",
  historyOfPresentIllness: "history_of_present_illness",
  subjective: "subjective",
  objective: "objective",
  assessment: "assessment",
  plan: "plan",
  clinicalSummary: "clinical_summary",
};

export class SOAPReviewService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/soap.repository.js").SOAPRepository} soapRepository
   * @param {import("./audit.service.js").AuditService} auditService
   */
  constructor(sessionRepository, soapRepository, auditService) {
    this._sessions = sessionRepository;
    this._soap = soapRepository;
    this._audit = auditService;
    this._log = createLogger({ component: "SOAPReviewService" });
  }

  /** @param {string} sessionId @param {import("../models/session.model.js").RequestContext} ctx */
  async getWorkspace(sessionId, ctx) {
    let session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    let note = await this._soap.getNoteBySession(sessionId);
    if (!note) throw new SOAPNotReadyError("SOAP note must be generated before review");

    if (session.status === SESSION_STATUS.SOAP_REVIEW_REQUIRED) {
      session = await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.SOAP_REVIEW_REQUIRED,
        SESSION_STATUS.SOAP_REVIEWING,
      );
      note = await this._soap.updateNote(note.id, {
        status: SOAP_NOTE_STATUS.REVIEWING,
        reviewer_id: ctx.actorId,
        review_started_at: new Date().toISOString(),
        original_note: note.original_note ?? note.note,
      });
      await this._audit.log({
        action: AUDIT_ACTION.SOAP_REVIEW_STARTED,
        sessionId,
        ctx,
        metadata: { soapNoteId: note.id },
      });
    } else if (![
      SESSION_STATUS.SOAP_REVIEWING,
      SESSION_STATUS.SOAP_APPROVED,
      SESSION_STATUS.READY_FOR_PRESCRIPTION,
    ].includes(session.status)) {
      throw new InvalidStateTransitionError(session.status, SESSION_STATUS.SOAP_REVIEWING);
    }

    const [versions, edits] = await Promise.all([
      this._soap.getVersions(sessionId),
      this._soap.getEdits(sessionId),
    ]);
    return { session, note, versions, edits };
  }

  /**
   * @param {string} sessionId
   * @param {Record<string, unknown>} rawInput
   * @param {import("../models/session.model.js").RequestContext} ctx
   */
  async updateSection(sessionId, rawInput, ctx) {
    const parsed = UpdateSOAPSectionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const { session, note } = await this._assertReviewing(sessionId, ctx);
    const { section_key: sectionKey, value, source } = parsed.data;
    const before = note.note?.[sectionKey] ?? "";
    if (before === value) return note;

    const nextNote = { ...(note.note ?? {}), [sectionKey]: value };
    const updated = await this._soap.updateNote(note.id, {
      note: nextNote,
      [SECTION_TO_COLUMN[sectionKey]]: value,
      status: SOAP_NOTE_STATUS.REVIEWING,
      original_note: note.original_note ?? note.note,
      modification_summary: summarizeDiff(note.original_note ?? note.note, nextNote),
      reviewer_id: ctx.actorId,
      reviewed_at: new Date().toISOString(),
    });

    await this._soap.insertEdit({
      soap_note_id: note.id,
      session_id: session.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      section_key: sectionKey,
      edit_type: "section_update",
      before_value: { [sectionKey]: before },
      after_value: { [sectionKey]: value },
      diff_metadata: describeSectionDiff(before, value, source),
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_SECTION_EDITED,
      sessionId,
      ctx,
      metadata: { soapNoteId: note.id, sectionKey, source },
    });

    return updated;
  }

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async createVersion(sessionId, rawInput, ctx) {
    const parsed = SaveSOAPVersionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const { session, note } = await this._assertReviewing(sessionId, ctx);
    const version = await this._createVersion(note, ctx, parsed.data.source, {
      label: parsed.data.label ?? null,
      diff: summarizeDiff(note.original_note ?? note.note, note.note),
    });

    await this._soap.insertEdit({
      soap_note_id: note.id,
      session_id: session.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      section_key: null,
      edit_type: parsed.data.source === "autosave" ? "autosave" : "manual_save",
      before_value: null,
      after_value: { version_id: version.id, version_number: version.version_number },
      diff_metadata: version.diff_metadata,
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_MANUAL_SAVE,
      sessionId,
      ctx,
      metadata: { soapNoteId: note.id, versionId: version.id, source: parsed.data.source },
    });

    return version;
  }

  /** @param {string} sessionId @param {import("../models/session.model.js").RequestContext} ctx */
  async getVersions(sessionId, ctx) {
    await this._assertAccessible(sessionId, ctx);
    return this._soap.getVersions(sessionId);
  }

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async compareVersions(sessionId, rawInput, ctx) {
    await this._assertAccessible(sessionId, ctx);
    const parsed = CompareSOAPVersionsSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const [from, to] = await Promise.all([
      this._soap.getVersion(parsed.data.from_version_id),
      this._soap.getVersion(parsed.data.to_version_id),
    ]);
    if (!from || !to || from.session_id !== sessionId || to.session_id !== sessionId) {
      throw new SessionNotFoundError("SOAP version");
    }
    return { from, to, diff: summarizeDiff(from.note, to.note) };
  }

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async approve(sessionId, rawInput, ctx) {
    const parsed = ApproveSOAPNoteSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const { session, note } = await this._assertReviewing(sessionId, ctx);

    let version = null;
    if (parsed.data.create_version) {
      version = await this._createVersion(note, ctx, "approved", {
        approvedAt: new Date().toISOString(),
        diff: summarizeDiff(note.original_note ?? note.note, note.note),
      });
    }

    const approvedAt = new Date().toISOString();
    const updatedNote = await this._soap.updateNote(note.id, {
      status: SOAP_NOTE_STATUS.APPROVED,
      reviewer_id: ctx.actorId,
      approved_at: approvedAt,
      reviewed_at: approvedAt,
      modification_summary: summarizeDiff(note.original_note ?? note.note, note.note),
    });
    const updatedSession = await this._sessions.transitionStatus(
      sessionId,
      ctx.doctorId,
      session.status,
      SESSION_STATUS.SOAP_APPROVED,
    );

    await this._soap.insertEdit({
      soap_note_id: note.id,
      session_id: session.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      section_key: null,
      edit_type: "approved",
      before_value: { status: note.status },
      after_value: { status: SOAP_NOTE_STATUS.APPROVED, version_id: version?.id ?? null },
      diff_metadata: updatedNote.modification_summary,
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_APPROVED,
      sessionId,
      ctx,
      metadata: { soapNoteId: note.id, versionId: version?.id ?? null },
    });

    return { session: updatedSession, note: updatedNote, version };
  }

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async reject(sessionId, rawInput, ctx) {
    const parsed = RejectSOAPNoteSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);
    const { session, note } = await this._assertReviewing(sessionId, ctx);

    const rejectedAt = new Date().toISOString();
    const updatedNote = await this._soap.updateNote(note.id, {
      status: SOAP_NOTE_STATUS.REJECTED,
      reviewer_id: ctx.actorId,
      rejected_at: rejectedAt,
      rejection_reason: parsed.data.reason,
    });
    const updatedSession = await this._sessions.transitionStatus(
      sessionId,
      ctx.doctorId,
      session.status,
      SESSION_STATUS.SOAP_REVIEW_REQUIRED,
    );

    await this._soap.insertEdit({
      soap_note_id: note.id,
      session_id: session.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      section_key: null,
      edit_type: "rejected",
      before_value: { status: note.status },
      after_value: { status: SOAP_NOTE_STATUS.REJECTED },
      diff_metadata: { reason: parsed.data.reason },
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_REJECTED,
      sessionId,
      ctx,
      metadata: { soapNoteId: note.id },
    });

    return { session: updatedSession, note: updatedNote };
  }

  async _createVersion(note, ctx, source, metadata = {}) {
    const versionNumber = await this._soap.getNextVersionNumber(note.id);
    return this._soap.createVersion({
      soap_note_id: note.id,
      session_id: note.session_id,
      transcript_version_id: note.transcript_version_id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      version_number: versionNumber,
      note: note.note,
      provider: note.provider,
      model: note.model,
      prompt_version: note.prompt_version,
      input_hash: note.input_hash,
      generation_metadata: note.generation_metadata,
      source,
      diff_metadata: metadata.diff ?? {},
      reviewer_id: ctx.actorId,
      approved_at: metadata.approvedAt ?? null,
      created_by: ctx.actorId,
    });
  }

  async _assertReviewing(sessionId, ctx) {
    const data = await this._assertAccessible(sessionId, ctx);
    if (data.session.status !== SESSION_STATUS.SOAP_REVIEWING) {
      throw new InvalidStateTransitionError(data.session.status, SESSION_STATUS.SOAP_REVIEWING);
    }
    return data;
  }

  async _assertAccessible(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const note = await this._soap.getNoteBySession(sessionId);
    if (!note) throw new SOAPNotReadyError("SOAP note must be generated before review");
    return { session, note };
  }
}

function summarizeDiff(original = {}, current = {}) {
  const changedSections = Object.keys(SECTION_TO_COLUMN).filter(
    (key) => (original?.[key] ?? "") !== (current?.[key] ?? ""),
  );
  return {
    changedSections,
    changedSectionCount: changedSections.length,
    generatedAt: new Date().toISOString(),
  };
}

function describeSectionDiff(before, after, source) {
  return {
    source,
    beforeLength: String(before ?? "").length,
    afterLength: String(after ?? "").length,
    delta: String(after ?? "").length - String(before ?? "").length,
  };
}
