/**
 * Starter pediatric dosage reference.
 *
 * Extend this list (and the matching DB seed in
 * supabase/migrations/036_pediatric_dosage_reference.sql) when adding drugs.
 * Confirm the clinic's preferred top list with Ravikiran before expanding.
 *
 * Notes:
 * - mg_per_kg_* are per single dose (not per day), except formulation "ors"
 *   where they represent ml/kg.
 * - concentration_mg_per_ml is set for syrups so the calculator can convert
 *   to ml (e.g. 250mg/5ml → 50).
 *
 * @typedef {{
 *   drugName: string;
 *   aliases: string[];
 *   mgPerKgMin: number;
 *   mgPerKgMax: number;
 *   maxSingleDoseMg: number;
 *   frequencyPerDay: number;
 *   formulation: "syrup" | "tablet" | "ors" | "other";
 *   concentrationMgPerMl: number|null;
 * }} PediatricDosageReference
 */

/** @type {ReadonlyArray<PediatricDosageReference>} */
export const PEDIATRIC_DOSAGE_REFERENCE = Object.freeze([
  Object.freeze({
    drugName: "Paracetamol",
    aliases: Object.freeze([
      "paracetamol",
      "acetaminophen",
      "crocin",
      "dolo",
      "calpol",
      "pcm",
    ]),
    mgPerKgMin: 10,
    mgPerKgMax: 15,
    maxSingleDoseMg: 1000,
    frequencyPerDay: 4,
    formulation: "syrup",
    // Common Indian ped syrup: 250 mg / 5 ml
    concentrationMgPerMl: 50,
  }),
  Object.freeze({
    drugName: "Amoxicillin",
    aliases: Object.freeze([
      "amoxicillin",
      "amoxycillin",
      "mox",
      "novamox",
      "trimox",
    ]),
    // Per-dose range for TID regimens (~20–40 mg/kg/day ÷ 3)
    mgPerKgMin: 8,
    mgPerKgMax: 15,
    maxSingleDoseMg: 500,
    frequencyPerDay: 3,
    formulation: "syrup",
    // Common: 125 mg / 5 ml
    concentrationMgPerMl: 25,
  }),
  Object.freeze({
    drugName: "Ibuprofen",
    aliases: Object.freeze([
      "ibuprofen",
      "brufen",
      "imoflam",
      "ibugesic",
    ]),
    mgPerKgMin: 5,
    mgPerKgMax: 10,
    maxSingleDoseMg: 400,
    frequencyPerDay: 3,
    formulation: "syrup",
    // Common: 100 mg / 5 ml
    concentrationMgPerMl: 20,
  }),
  Object.freeze({
    drugName: "ORS",
    aliases: Object.freeze([
      "ors",
      "oral rehydration",
      "oral rehydration solution",
      "electral",
      "orsolution",
    ]),
    // ml/kg after each loose stool (stored in mg_per_kg columns for schema fit)
    mgPerKgMin: 10,
    mgPerKgMax: 20,
    maxSingleDoseMg: 1000,
    frequencyPerDay: 1,
    formulation: "ors",
    concentrationMgPerMl: null,
  }),
]);

/**
 * @param {string|null|undefined} drugName
 * @param {ReadonlyArray<PediatricDosageReference>} [catalog]
 * @returns {PediatricDosageReference|null}
 */
export function findPediatricDosageReference(
  drugName,
  catalog = PEDIATRIC_DOSAGE_REFERENCE,
) {
  const raw = String(drugName ?? "").trim().toLowerCase();
  if (!raw) return null;

  for (const entry of catalog) {
    const names = [entry.drugName.toLowerCase(), ...entry.aliases.map((a) => a.toLowerCase())];
    if (names.some((alias) => raw === alias || raw.includes(alias))) {
      return entry;
    }
  }
  return null;
}
