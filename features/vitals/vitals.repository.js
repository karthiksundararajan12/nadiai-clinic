/**
 * @fileoverview VitalsRepository — data access for public.vitals
 * (migration 034). Reuses booking's BaseRepository/DatabaseError the same
 * way features/vaccinations does (see that file's header comment) rather
 * than only the barrel export — that convention is reserved for API
 * routes/pages.
 */

import { BaseRepository } from "../booking/repository/base.repository.js";

export class VitalsRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "vitals");
  }

  /**
   * @param {{
   *   clinicId: string;
   *   patientId: string;
   *   appointmentId: string|null;
   *   recordedBy: string|null;
   *   bloodPressureSystolic: number|null;
   *   bloodPressureDiastolic: number|null;
   *   temperatureCelsius: number|null;
   *   weightKg: number|null;
   *   heightCm: number|null;
   *   pulseBpm: number|null;
   *   spo2Percent: number|null;
   *   notes: string|null;
   * }} data
   * @returns {Promise<object>}
   */
  async create(data) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .insert({
            clinic_id: data.clinicId,
            patient_id: data.patientId,
            appointment_id: data.appointmentId ?? null,
            recorded_by: data.recordedBy ?? null,
            blood_pressure_systolic: data.bloodPressureSystolic ?? null,
            blood_pressure_diastolic: data.bloodPressureDiastolic ?? null,
            temperature_celsius: data.temperatureCelsius ?? null,
            weight_kg: data.weightKg ?? null,
            height_cm: data.heightCm ?? null,
            pulse_bpm: data.pulseBpm ?? null,
            spo2_percent: data.spo2Percent ?? null,
            notes: data.notes ?? null,
          })
          .select("*")
          .single(),
      "create",
    );
  }

  /**
   * Full vitals history for one patient, most recent first — no pagination
   * needed at per-patient scale (same approach as
   * VaccinationRepository.listForPatient).
   *
   * @param {string} clinicId
   * @param {string} patientId
   * @param {{ limit?: number }} [opts]
   * @returns {Promise<object[]>}
   */
  async listForPatient(clinicId, patientId, { limit = 50 } = {}) {
    return this._run(
      () =>
        this._db
          .from(this._table)
          .select("*")
          .eq("clinic_id", clinicId)
          .eq("patient_id", patientId)
          .order("recorded_at", { ascending: false })
          .limit(limit),
      "listForPatient",
    );
  }
}
