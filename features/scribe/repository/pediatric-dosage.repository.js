/**
 * Persistence for pediatric dosage reference + dose audit logs.
 */

import { BaseRepository } from "./base.repository.js";
import { PEDIATRIC_DOSAGE_REFERENCE } from "../lib/pediatric-dosage/reference-data.js";

/**
 * @param {Record<string, unknown>} row
 */
function mapDbReferenceRow(row) {
  return {
    drugName: String(row.drug_name),
    aliases: Array.isArray(row.aliases) ? row.aliases.map(String) : [],
    mgPerKgMin: Number(row.mg_per_kg_min),
    mgPerKgMax: Number(row.mg_per_kg_max),
    maxSingleDoseMg: Number(row.max_single_dose_mg),
    frequencyPerDay: Number(row.frequency_per_day),
    formulation: String(row.formulation),
    concentrationMgPerMl:
      row.concentration_mg_per_ml == null ? null : Number(row.concentration_mg_per_ml),
  };
}

export class PediatricDosageRepository extends BaseRepository {
  /** @param {import("@supabase/supabase-js").SupabaseClient} supabase */
  constructor(supabase) {
    super(supabase, "pediatric_dosage_reference");
  }

  /**
   * Active reference rows. Falls back to the JS seed catalog when the table
   * is unavailable (local/dev before migration) so suggestions still work.
   *
   * @returns {Promise<import("../lib/pediatric-dosage/reference-data.js").PediatricDosageReference[]>}
   */
  async listActiveReferences() {
    try {
      const rows = await this._run(
        () =>
          this._db
            .from("pediatric_dosage_reference")
            .select(
              "drug_name, mg_per_kg_min, mg_per_kg_max, max_single_dose_mg, " +
                "frequency_per_day, formulation, concentration_mg_per_ml, aliases",
            )
            .eq("is_active", true)
            .order("drug_name", { ascending: true }),
        "listPediatricDosageReferences",
      );
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map(mapDbReferenceRow);
      }
    } catch {
      // Fall through to JS catalog.
    }
    return [...PEDIATRIC_DOSAGE_REFERENCE];
  }

  /**
   * @param {Record<string, unknown>} row
   * @returns {Promise<Record<string, unknown>>}
   */
  async insertDoseAudit(row) {
    return this._run(
      () =>
        this._db
          .from("pediatric_dose_audit_logs")
          .insert(row)
          .select("*")
          .single(),
      "insertPediatricDoseAudit",
    );
  }
}
