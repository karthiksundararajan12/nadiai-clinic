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
  RestoreSOAPVersionSchema,
  SaveDoctorSOAPEditsSchema,
  SaveSOAPVersionSchema,
  SubmitSOAPReviewFeedbackSchema,
  UpdateSOAPSectionSchema,
} from "../schemas.js";
import { createLogger } from "../logger.js";
import {
  resolveSoapWorkflowAction,
  toDbSoapNoteStatus,
  toDbSoapVersionSource,
  withSoapWorkflowMetadata,
} from "../lib/soap-db-compat.js";

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

    const readOnlyStatuses = [
      SESSION_STATUS.SOAP_APPROVED,
      SESSION_STATUS.READY_FOR_PRESCRIPTION,
      SESSION_STATUS.GENERATING_PRESCRIPTION,
      SESSION_STATUS.PRESCRIPTION_DRAFT_READY,
      SESSION_STATUS.PRESCRIPTION_REVIEW_REQUIRED,
      SESSION_STATUS.PRESCRIPTION_REVIEWING,
      SESSION_STATUS.PRESCRIPTION_APPROVED,
      SESSION_STATUS.COMPLETED,
    ];

    if (session.status === SESSION_STATUS.SOAP_REVIEW_REQUIRED) {
      session = await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.SOAP_REVIEW_REQUIRED,
        SESSION_STATUS.SOAP_REVIEWING,
      );
      note = await this._soap.updateNote(note.id, {
        status: preserveReviewNoteStatus(note),
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
    } else if (session.status === SESSION_STATUS.SOAP_READY) {
      await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.SOAP_READY,
        SESSION_STATUS.SOAP_REVIEW_REQUIRED,
      );
      session = await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.SOAP_REVIEW_REQUIRED,
        SESSION_STATUS.SOAP_REVIEWING,
      );
      note = await this._soap.updateNote(note.id, {
        status: preserveReviewNoteStatus(note),
        reviewer_id: ctx.actorId,
        review_started_at: new Date().toISOString(),
        original_note: note.original_note ?? note.note,
      });
    } else if (session.status === SESSION_STATUS.SOAP_REVIEWING) {
      // already editing
    } else if (readOnlyStatuses.includes(session.status)) {
      // history / approved — return workspace read-only
    } else {
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
    const freshNote = await this._soap.getNoteBySession(sessionId);
    const version = await this._createVersion(freshNote ?? note, ctx, parsed.data.source, {
      label: parsed.data.label ?? null,
      diff: summarizeDiff(freshNote?.original_note ?? note.original_note ?? note.note, freshNote?.note ?? note.note),
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
      action: parsed.data.source === "autosave" ? AUDIT_ACTION.SOAP_MANUAL_SAVE : AUDIT_ACTION.SOAP_MANUAL_SAVE,
      sessionId,
      ctx,
      metadata: { soapNoteId: note.id, versionId: version.id, source: parsed.data.source },
    });
    await this._audit.log({
      action: AUDIT_ACTION.SOAP_VERSION_CREATED,
      sessionId,
      ctx,
      metadata: { soapNoteId: note.id, versionId: version.id, versionNumber: version.version_number, source: parsed.data.source },
    });

    return version;
  }

  /** @param {string} sessionId @param {import("../models/session.model.js").RequestContext} ctx */
  async getVersions(sessionId, ctx) {
    await this._assertAccessible(sessionId, ctx);
    return this._soap.getVersions(sessionId);
  }

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async restoreVersion(sessionId, rawInput, ctx) {
    const parsed = RestoreSOAPVersionSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const version = await this._soap.getVersion(parsed.data.version_id);
    if (!version || version.session_id !== sessionId) {
      throw new SessionValidationError("SOAP version not found for this session");
    }
    if (version.is_approved_version) {
      throw new SessionValidationError("Approved snapshots cannot be restored");
    }

    const { session, note } = await this._assertReviewing(sessionId, ctx);
    const restored = version.note ?? {};
    const updated = await this._soap.updateNote(note.id, {
      note: restored,
      subjective: restored.subjective ?? "",
      objective: restored.objective ?? "",
      assessment: restored.assessment ?? "",
      plan: restored.plan ?? "",
      chief_complaint: restored.chiefComplaint ?? "",
      history_of_present_illness: restored.historyOfPresentIllness ?? "",
      clinical_summary: restored.clinicalSummary ?? "",
      status: SOAP_NOTE_STATUS.REVIEWING,
      modification_summary: summarizeDiff(note.original_note ?? note.note, restored),
      reviewer_id: ctx.actorId,
      reviewed_at: new Date().toISOString(),
    });

    await this._soap.insertEdit({
      soap_note_id: note.id,
      session_id: session.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      section_key: null,
      edit_type: "version_restored",
      before_value: { version_number: note.version_number ?? null },
      after_value: { version_id: version.id, version_number: version.version_number },
      diff_metadata: { restoredFrom: version.version_number },
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_VERSION_RESTORED,
      sessionId,
      ctx,
      metadata: {
        soapNoteId: note.id,
        versionId: version.id,
        versionNumber: version.version_number,
      },
    });

    return { session, note: updated, version };
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

    const freshNote = (await this._soap.getNoteBySession(sessionId)) ?? note;

    let version = null;
    if (parsed.data.create_version) {
      version = await this._createVersion(freshNote, ctx, "approved", {
        approvedAt: new Date().toISOString(),
        isApprovedVersion: true,
        diff: summarizeDiff(freshNote.original_note ?? freshNote.note, freshNote.note),
      });
      await this._audit.log({
        action: AUDIT_ACTION.SOAP_VERSION_CREATED,
        sessionId,
        ctx,
        metadata: {
          soapNoteId: freshNote.id,
          versionId: version.id,
          versionNumber: version.version_number,
          source: "approved",
          isApprovedVersion: true,
        },
      });
    }

    const approvedAt = new Date().toISOString();
    const updatedNote = await this._soap.updateNote(freshNote.id, {
      status: SOAP_NOTE_STATUS.APPROVED,
      reviewer_id: ctx.actorId,
      approved_at: approvedAt,
      reviewed_at: approvedAt,
      modification_summary: summarizeDiff(freshNote.original_note ?? freshNote.note, freshNote.note),
    });
    let updatedSession = await this._sessions.transitionStatus(
      sessionId,
      ctx.doctorId,
      session.status,
      SESSION_STATUS.SOAP_APPROVED,
    );

    updatedSession = await this._sessions.transitionStatus(
      sessionId,
      ctx.doctorId,
      SESSION_STATUS.SOAP_APPROVED,
      SESSION_STATUS.COMPLETED,
      { error_message: null },
    );

    await this._audit.log({
      action: AUDIT_ACTION.STATE_TRANSITIONED,
      sessionId,
      ctx,
      metadata: { from: SESSION_STATUS.SOAP_APPROVED, to: SESSION_STATUS.COMPLETED },
    });

    await this._soap.insertEdit({
      soap_note_id: freshNote.id,
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

    await this._createVersion(note, ctx, "rejected", {
      diff: summarizeDiff(note.original_note ?? note.note, note.note),
      label: "Before rejection",
    });

    const rejectedAt = new Date().toISOString();
    const updatedNote = await this._soap.updateNote(note.id, {
      status: SOAP_NOTE_STATUS.REJECTED,
      reviewer_id: ctx.actorId,
      rejected_at: rejectedAt,
      rejection_reason: parsed.data.reason ?? "SOAP note not approved",
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

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async saveDoctorEdits(sessionId, rawInput, ctx) {
    const parsed = SaveDoctorSOAPEditsSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const patches = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined),
    );
    if (!Object.keys(patches).length) {
      throw new SessionValidationError("At least one SOAP section is required to save edits");
    }

    const { session, note } = await this._assertReviewing(sessionId, ctx);
    const generatedSoap = note.original_note ?? note.note ?? {};
    const nextNote = { ...(note.note ?? {}), ...patches };
    const editedAt = new Date().toISOString();

    const modificationSummary = {
      ...summarizeDiff(generatedSoap, nextNote),
      doctor_edited: true,
      edited_snapshot: nextNote,
      edited_at: editedAt,
    };

    const updated = await this._soap.updateNote(note.id, {
      note: nextNote,
      subjective: nextNote.subjective ?? note.subjective ?? "",
      objective: nextNote.objective ?? note.objective ?? "",
      assessment: nextNote.assessment ?? note.assessment ?? "",
      plan: nextNote.plan ?? note.plan ?? "",
      chief_complaint: nextNote.chiefComplaint ?? note.chief_complaint ?? "",
      history_of_present_illness: nextNote.historyOfPresentIllness ?? note.history_of_present_illness ?? "",
      clinical_summary: nextNote.clinicalSummary ?? note.clinical_summary ?? "",
      status: toDbSoapNoteStatus("doctor_edited"),
      original_note: note.original_note ?? note.note ?? generatedSoap,
      reviewer_id: ctx.actorId,
      reviewed_at: editedAt,
      modification_summary: modificationSummary,
      generation_metadata: withSoapWorkflowMetadata(note.generation_metadata, "doctor_edited"),
    });

    const version = await this._createVersion(updated, ctx, toDbSoapVersionSource("doctor_edited"), {
      diff: modificationSummary,
      label: "Edited by Doctor",
      workflow_source: "doctor_edited",
    });

    await this._soap.insertEdit({
      soap_note_id: note.id,
      session_id: session.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      section_key: null,
      edit_type: "doctor_edited",
      before_value: { generated: generatedSoap },
      after_value: { edited: nextNote, version_id: version.id },
      diff_metadata: version.diff_metadata,
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_DOCTOR_EDITED,
      sessionId,
      ctx,
      metadata: { soapNoteId: note.id, versionId: version.id },
    });

    return { session, note: updated, version };
  }

  /** @param {string} sessionId @param {Record<string, unknown>} rawInput @param {import("../models/session.model.js").RequestContext} ctx */
  async submitFeedback(sessionId, rawInput, ctx) {
    const parsed = SubmitSOAPReviewFeedbackSchema.safeParse(rawInput);
    if (!parsed.success) throw new SessionValidationError(parsed.error);

    const { session, note } = await this._assertAccessible(sessionId, ctx);
    const feedback = await this._soap.insertFeedback({
      session_id: sessionId,
      soap_note_id: note.id,
      transcript_version_id: note.transcript_version_id,
      soap_version_id: parsed.data.soap_version_id ?? null,
      review_action: parsed.data.review_action,
      feedback_reasons: parsed.data.feedback_reasons ?? [],
      other_reason: parsed.data.other_reason ?? null,
      generated_soap: note.original_note ?? note.note,
      edited_soap: note.edited_note ?? note.modification_summary?.edited_snapshot ?? note.note,
      note_status: mapFeedbackNoteStatus(note.status),
    });

    await this._soap.insertEdit({
      soap_note_id: note.id,
      session_id: session.id,
      clinic_id: ctx.clinicId,
      doctor_id: ctx.doctorId,
      actor_id: ctx.actorId,
      section_key: null,
      edit_type: "review_feedback",
      before_value: null,
      after_value: {
        review_action: parsed.data.review_action,
        feedback_reasons: parsed.data.feedback_reasons ?? [],
      },
      diff_metadata: { feedback_id: feedback.id },
    });

    await this._audit.log({
      action: AUDIT_ACTION.SOAP_REVIEW_FEEDBACK,
      sessionId,
      ctx,
      metadata: {
        soapNoteId: note.id,
        feedbackId: feedback.id,
        reviewAction: parsed.data.review_action,
        reasons: parsed.data.feedback_reasons ?? [],
      },
    });

    return feedback;
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
      diff_metadata: {
        ...(metadata.diff ?? {}),
        ...(metadata.label ? { label: metadata.label } : {}),
      },
      reviewer_id: ctx.actorId,
      approved_at: metadata.approvedAt ?? null,
      is_approved_version: metadata.isApprovedVersion ?? source === "approved",
      created_by: ctx.actorId,
    });
  }

  async _assertReviewing(sessionId, ctx) {
    const data = await this._assertAccessible(sessionId, ctx);
    const editable = [
      SESSION_STATUS.SOAP_REVIEWING,
      SESSION_STATUS.SOAP_REVIEW_REQUIRED,
      SESSION_STATUS.SOAP_READY,
    ];
    if (!editable.includes(data.session.status)) {
      throw new InvalidStateTransitionError(data.session.status, SESSION_STATUS.SOAP_REVIEWING);
    }
    if (data.session.status === SESSION_STATUS.SOAP_READY) {
      await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.SOAP_READY,
        SESSION_STATUS.SOAP_REVIEW_REQUIRED,
      );
      data.session = await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.SOAP_REVIEW_REQUIRED,
        SESSION_STATUS.SOAP_REVIEWING,
      );
    } else if (data.session.status === SESSION_STATUS.SOAP_REVIEW_REQUIRED) {
      data.session = await this._sessions.transitionStatus(
        sessionId,
        ctx.doctorId,
        SESSION_STATUS.SOAP_REVIEW_REQUIRED,
        SESSION_STATUS.SOAP_REVIEWING,
      );
    } else if (data.session.status !== SESSION_STATUS.SOAP_REVIEWING) {
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

function preserveReviewNoteStatus(note) {
  const action = resolveSoapWorkflowAction(note);
  if (action === "regenerated" || action === "doctor_edited") {
    return note?.status ?? SOAP_NOTE_STATUS.REVIEWING;
  }
  if (note?.status === SOAP_NOTE_STATUS.REGENERATED || note?.status === SOAP_NOTE_STATUS.EDITED) {
    return note.status;
  }
  return SOAP_NOTE_STATUS.REVIEWING;
}

function mapFeedbackNoteStatus(status) {
  if (status === SOAP_NOTE_STATUS.APPROVED) return "approved";
  if (status === SOAP_NOTE_STATUS.REJECTED) return "rejected";
  if (status === SOAP_NOTE_STATUS.REGENERATED) return "regenerated";
  if (status === SOAP_NOTE_STATUS.EDITED) return "edited";
  return "pending_review";
}
