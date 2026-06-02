/**
 * @fileoverview ConsultationHistoryService — enriched consultation list for history UI.
 */

import { SessionNotFoundError } from "../errors.js";
import { HISTORY_CONSULTATION_STATUSES, ACTIVE_CONSULTATION_STATUSES } from "../constants.js";

export class ConsultationHistoryService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/soap.repository.js").SOAPRepository} soapRepository
   * @param {import("../repository/prescription.repository.js").PrescriptionRepository} prescriptionRepository
   * @param {import("./audit.service.js").AuditService} auditService
   */
  constructor(sessionRepository, soapRepository, prescriptionRepository, auditService) {
    this._sessions = sessionRepository;
    this._soap = soapRepository;
    this._prescriptions = prescriptionRepository;
    this._audit = auditService;
  }

  /**
   * @param {Record<string, unknown>} rawFilters
   * @param {import("../models/session.model.js").RequestContext} ctx
   * @param {"active"|"history"|"all"} [bucket]
   */
  async listEnriched(rawFilters, ctx, bucket = "all") {
    const page = Number(rawFilters.page) > 0 ? Number(rawFilters.page) : 1;
    const limit = Math.min(Number(rawFilters.limit) > 0 ? Number(rawFilters.limit) : 50, 100);

    let statusFilter;
    if (bucket === "active") statusFilter = [...ACTIVE_CONSULTATION_STATUSES];
    else if (bucket === "history") statusFilter = [...HISTORY_CONSULTATION_STATUSES];

    const result = await this._sessions.findMany(ctx.doctorId, {
      status: statusFilter,
      page,
      limit,
      sort_by: "created_at",
      sort_order: "desc",
    });

    const enriched = await Promise.all(
      (result.data ?? []).map((session) => this._enrichSession(session, ctx)),
    );

    return { ...result, data: enriched };
  }

  /** @param {string} sessionId @param {import("../models/session.model.js").RequestContext} ctx */
  async getDetail(sessionId, ctx) {
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);
    const [detail, auditTrail] = await Promise.all([
      this._enrichSession(session, ctx),
      this._audit.getSessionAuditTrail(sessionId, ctx.clinicId),
    ]);
    return { consultation: detail, auditTrail };
  }

  async _enrichSession(session, ctx) {
    const [patient, doctor, soapNote, prescription] = await Promise.all([
      session.patient_id
        ? this._sessions.getPatientName(session.patient_id, ctx.doctorId)
        : null,
      this._sessions.getDoctorName(ctx.doctorId),
      this._soap.getNoteBySession(session.id),
      this._prescriptions.getDraftBySession(session.id),
    ]);

    return {
      ...session,
      patient_name: patient?.name ?? "—",
      doctor_name: doctor?.full_name ?? "—",
      transcript_status: transcriptStatusLabel(session.status),
      soap_status: soapNote?.status ?? "not_generated",
      prescription_status: prescription?.status ?? "not_generated",
      approval_status: approvalStatusLabel(session.status, soapNote?.status),
      has_soap: Boolean(soapNote),
      soap_note_id: soapNote?.id ?? null,
      prescription_draft_id: prescription?.id ?? null,
    };
  }
}

function transcriptStatusLabel(sessionStatus) {
  if (["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"].includes(sessionStatus)) return "ready";
  if (["TRANSCRIBING", "TRANSCRIPTION_QUEUED"].includes(sessionStatus)) return "processing";
  if (sessionStatus === "TRANSCRIPTION_FAILED") return "failed";
  if (["UPLOADED", "UPLOADING", "RECORDING", "CREATED"].includes(sessionStatus)) return "pending";
  if (sessionStatus === "COMPLETED" || sessionStatus.startsWith("SOAP") || sessionStatus.startsWith("PRESCRIPTION")) {
    return "completed";
  }
  return sessionStatus;
}

function approvalStatusLabel(sessionStatus, soapStatus) {
  if (sessionStatus === "COMPLETED" || soapStatus === "approved") return "approved";
  if (soapStatus === "rejected") return "rejected";
  if (["SOAP_REVIEWING", "SOAP_REVIEW_REQUIRED", "SOAP_READY"].includes(sessionStatus)) return "pending_approval";
  if (soapStatus === "reviewing" || soapStatus === "review_required") return "pending_approval";
  return "in_progress";
}
