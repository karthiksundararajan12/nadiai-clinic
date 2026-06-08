/**
 * @fileoverview SOAPExportService — assembles clinical documents for export.
 */

import { AUDIT_ACTION, SOAP_VIEWABLE_SESSION_STATUSES } from "../constants.js";
import { SessionNotFoundError, SOAPNotReadyError } from "../errors.js";
import { buildSoapExportHtml } from "../lib/soap-export-template.js";
import { createLogger } from "../logger.js";

export class SOAPExportService {
  /**
   * @param {import("../repository/session.repository.js").SessionRepository} sessionRepository
   * @param {import("../repository/soap.repository.js").SOAPRepository} soapRepository
   * @param {import("./audit.service.js").AuditService} auditService
   */
  constructor(sessionRepository, soapRepository, auditService) {
    this._sessions = sessionRepository;
    this._soap = soapRepository;
    this._audit = auditService;
    this._log = createLogger({ component: "SOAPExportService" });
  }

  /**
   * @param {string} sessionId
   * @param {import("../models/session.model.js").RequestContext} ctx
   * @param {{ format?: "json"|"html" }} [options]
   */
  async exportSession(sessionId, ctx, options = {}) {
    const format = options.format ?? "json";
    const session = await this._sessions.findById(sessionId, ctx.doctorId);
    if (!session) throw new SessionNotFoundError(sessionId);

    if (!SOAP_VIEWABLE_SESSION_STATUSES.includes(session.status)) {
      throw new SOAPNotReadyError(
        `SOAP note is not available for export (status: ${session.status})`,
      );
    }

    const context = await this._soap.getGenerationContext(sessionId);
    const note = await this._soap.getNoteBySession(sessionId);
    if (!note?.note && !note) {
      throw new SOAPNotReadyError("No SOAP note found for this session");
    }

    const payload = {
      session: {
        id: session.id,
        status: session.status,
        language: session.language,
        created_at: session.created_at,
      },
      doctor: context?.doctor ?? null,
      patient: context?.patient ?? null,
      note: note?.note ?? note,
      noteStatus: note?.status ?? null,
      segments: (context?.segments ?? []).map((s) => ({
        speaker_label: s.speaker_label,
        text: s.text,
        start_seconds: s.start_seconds,
      })),
      exportedAt: new Date().toISOString(),
    };

    await this._audit.log({
      action: AUDIT_ACTION.SESSION_EXPORTED,
      sessionId,
      ctx,
      metadata: { format, noteStatus: note?.status ?? null },
    });

    this._log.info("SOAP session exported", { sessionId, format });

    if (format === "html") {
      const html = buildSoapExportHtml(payload);
      return {
        ...payload,
        html,
        filename: `soap-${sessionId.slice(0, 8)}-${Date.now()}.html`,
      };
    }

    return {
      ...payload,
      filename: `soap-${sessionId.slice(0, 8)}-${Date.now()}.json`,
    };
  }
}
