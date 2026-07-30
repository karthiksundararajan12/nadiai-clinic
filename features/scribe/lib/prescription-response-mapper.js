/**
 * Maps Gemini prescription JSON to the internal PrescriptionDraft shape.
 */

import { applySoapSeedsToDraftFields } from "./prescription-soap-seed.js";

/**
 * @param {Record<string, unknown>} raw
 * @param {string} [assessment]
 * @param {string} [plan]
 * @returns {import('../schemas.js').PrescriptionDraft}
 */
export function mapGeminiPrescriptionToDraft(raw, assessment = "", plan = "") {
  const drugs = Array.isArray(raw.drugs) ? raw.drugs : [];
  const adviceText = typeof raw.advice === "string" ? raw.advice.trim() : "";
  const followupDays = Number(raw.followup_days);
  const hasFollowup = Number.isFinite(followupDays) && followupDays > 0;

  const aiAdvice = adviceText ? [adviceText] : [];
  const aiInvestigations = Array.isArray(raw.investigations)
    ? raw.investigations.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const seeded = applySoapSeedsToDraftFields({
    assessment,
    plan,
    existingAdvice: aiAdvice,
    existingInvestigations: aiInvestigations,
  });

  return {
    diagnosis: seeded.diagnosis,
    medications: drugs.map((drug) => ({
      name: String(drug.name ?? "").trim() || "Medicine",
      dosage: String(drug.dose ?? drug.dosage ?? "").trim() || "Not specified",
      frequency: String(drug.frequency ?? "").trim() || "Not specified",
      duration: String(drug.duration ?? "").trim() || "Not specified",
      instructions: String(drug.instructions ?? "").trim(),
      confidence: 0.85,
    })),
    investigations: seeded.investigations,
    advice: seeded.advice,
    followUpInstructions: hasFollowup ? `Follow up in ${followupDays} days` : "",
    followUpDays: hasFollowup ? followupDays : undefined,
    warnings: [],
  };
}

/**
 * Empty manual-entry draft seeded from SOAP Assessment + Plan.
 *
 * @param {string} [assessment]
 * @param {string} [plan]
 * @returns {import('../schemas.js').PrescriptionDraft}
 */
export function buildEmptyManualDraft(assessment = "", plan = "") {
  const seeded = applySoapSeedsToDraftFields({ assessment, plan });
  return {
    diagnosis: seeded.diagnosis,
    medications: [],
    investigations: seeded.investigations,
    advice: seeded.advice,
    followUpInstructions: "",
    followUpDays: undefined,
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
