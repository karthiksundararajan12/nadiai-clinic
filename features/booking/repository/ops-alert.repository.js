/**
 * @fileoverview OpsAlertRepository — read access to public.ops_alerts
 * (migration 032) for DailyDigestService. Writes go through
 * features/booking/lib/alerting.js's `alertOps`, not through this
 * repository — this file is query-only.
 *
 * Cross-clinic by design: unlike every other booking repository (always
 * scoped by clinic_id — see ARCHITECTURE.md), these are platform-wide
 * admin/ops queries, never exposed to a doctor's dashboard session. Only
 * used by the CRON_SECRET-gated daily-digest cron route.
 */

import { DatabaseError } from "../errors.js";
import { BaseRepository } from "./base.repository.js";

export class OpsAlertRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "ops_alerts");
  }

  /**
   * Total ops_alerts rows created within [fromIso, toIso).
   *
   * @param {string} fromIso
   * @param {string} toIso
   * @returns {Promise<number>}
   */
  async countBetween(fromIso, toIso) {
    const { count, error } = await this._db
      .from(this._table)
      .select("id", { count: "exact", head: true })
      .gte("created_at", fromIso)
      .lt("created_at", toIso);

    if (error) {
      this._log.error("DB error during countBetween", { code: error.code });
      throw new DatabaseError("countBetween", error);
    }
    return count ?? 0;
  }

  /**
   * Count of ops_alerts rows created within [fromIso, toIso) whose `step`
   * is one of `steps`.
   *
   * @param {string[]} steps
   * @param {string} fromIso
   * @param {string} toIso
   * @returns {Promise<number>}
   */
  async countByStepsBetween(steps, fromIso, toIso) {
    if (!steps || steps.length === 0) return 0;

    const { count, error } = await this._db
      .from(this._table)
      .select("id", { count: "exact", head: true })
      .in("step", steps)
      .gte("created_at", fromIso)
      .lt("created_at", toIso);

    if (error) {
      this._log.error("DB error during countByStepsBetween", { code: error.code, steps });
      throw new DatabaseError("countByStepsBetween", error);
    }
    return count ?? 0;
  }
}
