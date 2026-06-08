/** Core SOAP sections required for clinical sign-off. */
export const CORE_SOAP_SECTIONS = [
  ["subjective", "Subjective"],
  ["objective", "Objective"],
  ["assessment", "Assessment"],
  ["plan", "Plan"],
];

const REQUIRED_FOR_APPROVAL = new Set(["assessment", "plan"]);

/**
 * @param {Record<string, string>} draft
 * @returns {Array<{ key: string; label: string; severity: "warning"|"error" }>}
 */
export function getSoapClinicalWarnings(draft) {
  const warnings = [];

  for (const [key, label] of CORE_SOAP_SECTIONS) {
    const value = String(draft?.[key] ?? "").trim();
    if (!value) {
      warnings.push({
        key,
        label,
        severity: REQUIRED_FOR_APPROVAL.has(key) ? "error" : "warning",
        message: REQUIRED_FOR_APPROVAL.has(key)
          ? `${label} is required before approval`
          : `${label} is empty`,
      });
    }
  }

  return warnings;
}

export function hasBlockingSoapWarnings(warnings) {
  return warnings.some((w) => w.severity === "error");
}
