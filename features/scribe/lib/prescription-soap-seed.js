/**
 * Seeds prescription draft fields from SOAP sections.
 * Used when AI advice is missing and for manual-entry drafts so Advice /
 * Investigations / Diagnosis are not left blank when SOAP already has content.
 */

const INVESTIGATION_PATTERN =
  /\b(investigat|cbc|complete blood|x-?ray|mri|ct\b|usg|ultrasound|echo|ecg|ekg|lab\b|blood test|scan|biopsy|culture|swab|lft|rft|kft|tsh|hba1c|lipid|urine|sputum|referral for)\b/i;

const MEDICATION_LINE_PATTERN =
  /\b(\d+\s*mg|\d+\s*ml|tablet|capsule|syrup|injection|1-\d-\d|bd\b|tds\b|od\b|sos\b)\b/i;

/**
 * @param {string|null|undefined} text
 * @returns {string[]}
 */
export function splitSoapLines(text) {
  if (!text || typeof text !== "string") return [];
  return text
    .split(/\n|;/)
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * @param {string|null|undefined} assessment
 * @param {{ max?: number }} [opts]
 * @returns {string[]}
 */
export function diagnosisFromAssessment(assessment, opts = {}) {
  const max = opts.max ?? 5;
  return splitSoapLines(assessment).slice(0, max);
}

/**
 * Splits a SOAP Plan into advice vs investigation lines.
 * Medication-looking lines are omitted from advice (they belong in Rx).
 *
 * @param {string|null|undefined} plan
 * @returns {{ advice: string[]; investigations: string[] }}
 */
export function seedAdviceAndInvestigationsFromPlan(plan) {
  const advice = [];
  const investigations = [];

  for (const line of splitSoapLines(plan)) {
    if (INVESTIGATION_PATTERN.test(line)) {
      investigations.push(line);
      continue;
    }
    if (MEDICATION_LINE_PATTERN.test(line)) {
      continue;
    }
    advice.push(line);
  }

  return { advice, investigations };
}

/**
 * @param {{
 *   assessment?: string|null;
 *   plan?: string|null;
 *   existingAdvice?: string[];
 *   existingInvestigations?: string[];
 *   existingDiagnosis?: string[];
 * }} input
 */
export function applySoapSeedsToDraftFields(input) {
  const seeded = seedAdviceAndInvestigationsFromPlan(input.plan);
  const diagnosis =
    input.existingDiagnosis?.length
      ? input.existingDiagnosis
      : diagnosisFromAssessment(input.assessment);

  return {
    diagnosis,
    advice: input.existingAdvice?.length ? input.existingAdvice : seeded.advice,
    investigations: input.existingInvestigations?.length
      ? input.existingInvestigations
      : seeded.investigations,
  };
}
