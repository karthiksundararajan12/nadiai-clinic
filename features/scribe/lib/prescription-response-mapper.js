/**
 * Maps Gemini prescription JSON to the internal PrescriptionDraft shape.
 */

/**
 * @param {Record<string, unknown>} raw
 * @param {string} [assessment]
 * @returns {import('../schemas.js').PrescriptionDraft}
 */
export function mapGeminiPrescriptionToDraft(raw, assessment = "") {
  const drugs = Array.isArray(raw.drugs) ? raw.drugs : [];
  const diagnosis = assessment
    ? assessment
        .split(/[;\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  const adviceText = typeof raw.advice === "string" ? raw.advice.trim() : "";
  const followupDays = Number(raw.followup_days);
  const hasFollowup = Number.isFinite(followupDays) && followupDays > 0;

  return {
    diagnosis,
    medications: drugs.map((drug) => ({
      name: String(drug.name ?? "").trim() || "Medicine",
      dosage: String(drug.dose ?? drug.dosage ?? "").trim() || "Not specified",
      frequency: String(drug.frequency ?? "").trim() || "Not specified",
      duration: String(drug.duration ?? "").trim() || "Not specified",
      instructions: String(drug.instructions ?? "").trim(),
      confidence: 0.85,
    })),
    investigations: [],
    advice: adviceText ? [adviceText] : [],
    followUpInstructions: hasFollowup ? `Follow up in ${followupDays} days` : "",
    followUpDays: hasFollowup ? followupDays : undefined,
    warnings: [],
  };
}

/**
 * @param {unknown} parsed
 * @returns {boolean}
 */
export function isGeminiPrescriptionFormat(parsed) {
  return Boolean(parsed && typeof parsed === "object" && "drugs" in parsed);
}
