import { BaseRepository } from "../booking/repository/base.repository.js";

const OPEN_VISIT_MS = 18 * 60 * 60 * 1000;

export class VisitVitalsRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "visit_vitals");
  }

  /**
   * @param {{ clinicId: string, patientId?: string|null, appointmentId?: string|null, sessionId?: string|null }} key
   */
  async findForVisit({ clinicId, patientId, appointmentId, sessionId }) {
    if (sessionId) {
      const bySession = await this._runNullable(
        () => this._db.from(this._table).select("*").eq("session_id", sessionId).maybeSingle(),
        "findVisitVitalsBySession",
      );
      if (bySession) return bySession;
    }

    if (appointmentId) {
      const byAppointment = await this._runNullable(
        () => this._db
          .from(this._table)
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("appointment_id", appointmentId)
          .maybeSingle(),
        "findVisitVitalsByAppointment",
      );
      if (byAppointment) return byAppointment;
    }

    if (!patientId) return null;
    const recent = await this._run(
      () => this._db
        .from(this._table)
        .select("*")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId)
        .order("updated_at", { ascending: false })
        .limit(1),
      "findLatestVisitVitals",
    );
    const row = recent?.[0] ?? null;
    if (!row?.updated_at) return null;
    if (Date.now() - new Date(row.updated_at).getTime() > OPEN_VISIT_MS) return null;
    return row;
  }

  /** @param {Record<string, unknown>} row */
  async insert(row) {
    return this._run(
      () => this._db.from(this._table).insert(row).select("*").single(),
      "insertVisitVitals",
    );
  }

  /**
   * @param {string} id
   * @param {Record<string, unknown>} patch
   */
  async update(id, patch) {
    return this._run(
      () => this._db.from(this._table).update(patch).eq("id", id).select("*").single(),
      "updateVisitVitals",
    );
  }
}
