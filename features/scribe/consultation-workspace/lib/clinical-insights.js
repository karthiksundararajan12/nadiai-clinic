/**
 * Client-side clinical insight derivation (ICD-10, RPM) from SOAP draft.
 * Populates UI until dedicated generate_icd worker is wired.
 */

const ICD_HINTS = [
  { pattern: /upper respiratory|uri|cold|coryza|runny nose/i, code: "J06.9", label: "Acute upper respiratory infection, unspecified" },
  { pattern: /viral fever|fever|pyrexia/i, code: "R50.9", label: "Fever, unspecified" },
  { pattern: /hypertension|high blood pressure|bp elevated/i, code: "I10", label: "Essential (primary) hypertension" },
  { pattern: /diabetes|dm type|hyperglycemia/i, code: "E11.9", label: "Type 2 diabetes mellitus without complications" },
  { pattern: /gastroenteritis|diarrhea|vomiting/i, code: "A09", label: "Infectious gastroenteritis and colitis, unspecified" },
  { pattern: /asthma|wheez/i, code: "J45.909", label: "Unspecified asthma, uncomplicated" },
];

/**
 * @param {Record<string, string>} draft
 * @param {object} [note]
 */
export function deriveClinicalInsights(draft = {}, note = null) {
  const meta = note?.generation_metadata ?? {};
  const assessment = `${draft.assessment ?? ""} ${draft.clinicalSummary ?? ""}`;

  let primary = meta.icdCode
    ? { code: meta.icdCode.code ?? meta.icdCode, description: meta.icdCode.description ?? "" }
    : null;

  if (!primary) {
    for (const hint of ICD_HINTS) {
      if (hint.pattern.test(assessment)) {
        primary = { code: hint.code, description: hint.label };
        break;
      }
    }
  }

  if (!primary && assessment.trim()) {
    primary = { code: "R69", description: "Illness, unspecified" };
  }

  const secondary = (meta.secondaryIcdCodes ?? []).slice(0, 3);

  const plan = `${draft.plan ?? ""}`;
  const rpmRecommended =
    Boolean(meta.rpmRecommended) ||
    /follow.?up|monitor|check.?in|whatsapp|remote/i.test(plan);

  const rpmReason =
    meta.rpmReason ??
    (rpmRecommended
      ? "Follow-up monitoring recommended based on consultation plan."
      : null);

  return {
    icd: primary ? { primary, secondary } : null,
    rpm: { recommended: rpmRecommended, reason: rpmReason },
  };
}

export function formatIcdDisplay(icd) {
  if (!icd?.primary) return null;
  return `${icd.primary.code} — ${icd.primary.description}`;
}
