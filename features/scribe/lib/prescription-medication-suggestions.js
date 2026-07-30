/**
 * Helpers for AI-suggested prescription medications.
 *
 * Manual "+ Add Medicine" rows use confidence = 1.
 * Gemini-suggested rows use confidence in (0, 1] from the model (default 0.85).
 * The draft UI treats confidence < 1 as "AI suggested".
 */

/** SOAP assessment fallbacks that mean there is no usable diagnosis. */
const UNUSABLE_ASSESSMENT_PATTERNS = [
  /^assessment not documented/i,
  /^not documented/i,
  /^n\/?a$/i,
  /^none$/i,
  /^unknown$/i,
  /^unclear$/i,
];

export const AI_SUGGESTED_MEDICATION_DEFAULT_CONFIDENCE = 0.85;
export const MANUAL_MEDICATION_CONFIDENCE = 1;

/**
 * @param {string|null|undefined} assessment
 * @returns {boolean}
 */
export function isUsableSoapAssessment(assessment) {
  const text = String(assessment ?? "").trim();
  if (!text) return false;
  if (UNUSABLE_ASSESSMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }
  // Extremely short / non-clinical stubs
  if (text.length < 3) return false;
  return true;
}

/**
 * @param {unknown} rawConfidence
 * @returns {number} 0–1
 */
export function normalizeMedicationConfidence(rawConfidence) {
  const value = Number(rawConfidence);
  if (!Number.isFinite(value)) return AI_SUGGESTED_MEDICATION_DEFAULT_CONFIDENCE;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * @param {{ confidence?: number }|null|undefined} med
 * @returns {boolean}
 */
export function isAiSuggestedMedication(med) {
  const confidence = Number(med?.confidence);
  return Number.isFinite(confidence) && confidence < MANUAL_MEDICATION_CONFIDENCE;
}

/**
 * Maps a Gemini drug object into PrescriptionMedicationSchema shape.
 * Caller must only invoke when assessment is usable.
 *
 * @param {Record<string, unknown>} drug
 * @returns {import("../schemas.js").PrescriptionMedication}
 */
export function mapGeminiDrugToMedication(drug) {
  return {
    name: String(drug.name ?? "").trim() || "Medicine",
    dosage: String(drug.dose ?? drug.dosage ?? "").trim() || "Not specified",
    frequency: String(drug.frequency ?? "").trim() || "Not specified",
    duration: String(drug.duration ?? "").trim() || "Not specified",
    instructions: String(drug.instructions ?? "").trim(),
    confidence: normalizeMedicationConfidence(drug.confidence),
  };
}
