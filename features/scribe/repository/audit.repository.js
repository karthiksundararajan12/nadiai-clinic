/**
 * @fileoverview AuditRepository — insert-only data access for scribe_audit_logs.
 *
 * This repository intentionally exposes NO update or delete methods.
 * The immutability trigger in Postgres enforces this at the database level too.
 * Treat writes here as fire-and-forget: audit failures MUST NOT break the
 * primary operation. The service layer handles this gracefully.
 */

import { BaseRepository } from "./base.repository.js";

/** @typedef {import("../models/session.model.js").ScribeAuditLog} ScribeAuditLog */

export class AuditRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "scribe_audit_logs");
  }

  // ─────────────────────────────────────────────────────────────
  // INSERT
  // ─────────────────────────────────────────────────────────────

  /**
   * Appends a single audit log entry.
   * Never throws — audit failures are logged but do not propagate.
   *
   * @param {{
   *   session_id?:  string|null;
   *   clinic_id:    string;
   *   doctor_id:    string;
   *   actor_id:     string;
   *   action:       string;
   *   ip_address?:  string|null;
   *   user_agent?:  string|null;
   *   metadata?:    Record<string, unknown>;
   * }} entry
   * @returns {Promise<boolean>} true on success, false on failure
   */
  async insert(entry) {
    try {
      const { error } = await this._db
        .from(this._table)
        .insert({
          session_id:  entry.session_id  ?? null,
          clinic_id:   entry.clinic_id,
          doctor_id:   entry.doctor_id,
          actor_id:    entry.actor_id,
          action:      entry.action,
          ip_address:  entry.ip_address  ?? null,
          user_agent:  entry.user_agent  ?? null,
          metadata:    entry.metadata    ?? {},
        });

      if (error) {
        this._log.error("Audit log insert failed (non-fatal)", {
          action:   entry.action,
          code:     error.code,
        });
        return false;
      }

      return true;
    } catch (err) {
      this._log.error("Unexpected error writing audit log (non-fatal)", {
        action: entry.action,
        error:  err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  /**
   * Batch-inserts multiple audit entries in one round-trip.
   * Same non-throwing contract as insert().
   *
   * @param {Parameters<AuditRepository["insert"]>[0][]} entries
   * @returns {Promise<boolean>}
   */
  async insertMany(entries) {
    if (!entries.length) return true;
    try {
      const { error } = await this._db
        .from(this._table)
        .insert(
          entries.map((e) => ({
            session_id: e.session_id ?? null,
            clinic_id:  e.clinic_id,
            doctor_id:  e.doctor_id,
            actor_id:   e.actor_id,
            action:     e.action,
            ip_address: e.ip_address ?? null,
            user_agent: e.user_agent ?? null,
            metadata:   e.metadata   ?? {},
          })),
        );

      if (error) {
        this._log.error("Batch audit log insert failed (non-fatal)", {
          count: entries.length,
          code:  error.code,
        });
        return false;
      }

      return true;
    } catch (err) {
      this._log.error("Unexpected error in batch audit log (non-fatal)", {
        count: entries.length,
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // READ — for compliance dashboards
  // ─────────────────────────────────────────────────────────────

  /**
   * Returns all audit entries for a session, newest first.
   *
   * @param {string} sessionId
   * @param {string} clinicId  - Enforces tenant isolation
   * @returns {Promise<ScribeAuditLog[]>}
   */
  async findBySession(sessionId, clinicId) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("*")
          .eq("session_id", sessionId)
          .eq("clinic_id",  clinicId)
          .order("created_at", { ascending: false }),
      "findBySession",
    );
  }

  /**
   * Paginated audit log for a clinic within a date window.
   *
   * @param {string}  clinicId
   * @param {Object}  [opts]
   * @param {string}  [opts.action]    - Filter by action type
   * @param {string}  [opts.dateFrom]  - ISO 8601
   * @param {string}  [opts.dateTo]    - ISO 8601
   * @param {number}  [opts.page=1]
   * @param {number}  [opts.limit=50]
   * @returns {Promise<{ data: ScribeAuditLog[]; total: number }>}
   */
  async findByClinic(clinicId, opts = {}) {
    const { action, dateFrom, dateTo, page = 1, limit = 50 } = opts;
    const offset = (page - 1) * limit;

    let query = this._db
      .from(this._table)
      .select("*", { count: "exact" })
      .eq("clinic_id", clinicId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (action)   query = query.eq("action",     action);
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo)   query = query.lte("created_at", dateTo);

    const { data, error, count } = await query;
    if (error) throw new Error(`findByClinic failed: ${error.message}`);

    return { data: data ?? [], total: count ?? 0 };
  }
}
