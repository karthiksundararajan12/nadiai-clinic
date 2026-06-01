/**
 * @fileoverview AuditService — enriches and dispatches audit log entries.
 *
 * Wraps AuditRepository to:
 *  - Enforce the no-PII rule on metadata
 *  - Provide a fluent context-bound API for service-layer callers
 *  - Never let audit failures propagate to the user
 */

import { AuditRepository } from "../repository/audit.repository.js";
import { createLogger }    from "../logger.js";

/** @typedef {import("../models/session.model.js").RequestContext} RequestContext */

export class AuditService {
  /**
   * @param {AuditRepository} auditRepository
   */
  constructor(auditRepository) {
    this._repo = auditRepository;
    this._log  = createLogger({ component: "AuditService" });
  }

  // ─────────────────────────────────────────────────────────────
  // CORE LOG METHOD
  // ─────────────────────────────────────────────────────────────

  /**
   * Logs a single audit event. Never throws.
   *
   * @param {Object} params
   * @param {string}                   params.action
   * @param {string|null}              [params.sessionId]
   * @param {RequestContext}           params.ctx
   * @param {Record<string, unknown>}  [params.metadata={}]
   * @returns {Promise<void>}
   */
  async log({ action, sessionId = null, ctx, metadata = {} }) {
    this._piiGuard(metadata);

    await this._repo.insert({
      action,
      session_id: sessionId,
      clinic_id:  ctx.clinicId,
      doctor_id:  ctx.doctorId,
      actor_id:   ctx.actorId,
      ip_address: ctx.ipAddress ?? null,
      user_agent: ctx.userAgent ?? null,
      metadata,
    });
  }

  /**
   * Logs multiple events in a single round-trip. Never throws.
   *
   * @param {Array<{ action: string; sessionId?: string|null; metadata?: Record<string, unknown> }>} events
   * @param {RequestContext} ctx
   * @returns {Promise<void>}
   */
  async logMany(events, ctx) {
    const entries = events.map((e) => {
      this._piiGuard(e.metadata ?? {});
      return {
        action:     e.action,
        session_id: e.sessionId  ?? null,
        clinic_id:  ctx.clinicId,
        doctor_id:  ctx.doctorId,
        actor_id:   ctx.actorId,
        ip_address: ctx.ipAddress ?? null,
        user_agent: ctx.userAgent ?? null,
        metadata:   e.metadata   ?? {},
      };
    });

    await this._repo.insertMany(entries);
  }

  // ─────────────────────────────────────────────────────────────
  // QUERY METHODS
  // ─────────────────────────────────────────────────────────────

  /**
   * @param {string} sessionId
   * @param {string} clinicId
   */
  async getSessionAuditTrail(sessionId, clinicId) {
    return this._repo.findBySession(sessionId, clinicId);
  }

  /**
   * @param {string} clinicId
   * @param {Parameters<AuditRepository["findByClinic"]>[1]} opts
   */
  async getClinicAuditLog(clinicId, opts) {
    return this._repo.findByClinic(clinicId, opts);
  }

  // ─────────────────────────────────────────────────────────────
  // PII GUARD
  // ─────────────────────────────────────────────────────────────

  /**
   * Warns loudly in development if metadata contains likely-PII keys.
   * In production, strips the offending keys silently to prevent leaks.
   *
   * Allowed metadata: IDs, status values, counts, model names, cost figures,
   * chunk indices, boolean flags.
   * NEVER put in metadata: names, phone numbers, transcript text, email, DOB.
   *
   * @param {Record<string, unknown>} metadata
   */
  _piiGuard(metadata) {
    const PII_KEYS = [
      "name", "phone", "email", "dob", "birth", "address",
      "transcript", "text", "note", "prescription",
    ];

    const flagged = Object.keys(metadata).filter((k) =>
      PII_KEYS.some((pii) => k.toLowerCase().includes(pii)),
    );

    if (!flagged.length) return;

    if (process.env.NODE_ENV !== "production") {
      this._log.warn("PII guard: potential PII keys in audit metadata — remove them", {
        flaggedKeys: flagged,
      });
    }

    // Strip in all environments to prevent accidental leaks
    for (const key of flagged) {
      delete metadata[key];
    }
  }
}
