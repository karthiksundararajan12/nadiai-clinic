/**
 * Derives consultation summary display fields from SOAP draft (client-side only).
 */

function parseDuration(text) {
  const match = String(text ?? "").match(/(\d+)\s*(day|week|month|hour)/i);
  if (match) return `${match[1]} ${match[2]}${Number(match[1]) > 1 ? "s" : ""}`;
  return null;
}

function parseSymptoms(text) {
  const lines = String(text ?? "")
    .split(/[\n,;•]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 80);
  return lines.slice(0, 6);
}

/**
 * @param {Record<string, string>} draft
 */
export function buildConsultationSummary(draft = {}) {
  const chiefComplaint =
    draft.chiefComplaint?.trim() ||
    draft.subjective?.split(/[\n.]/)[0]?.trim()?.slice(0, 120) ||
    null;

  const hpi = draft.historyOfPresentIllness ?? draft.subjective ?? "";
  const duration = parseDuration(hpi) || parseDuration(draft.subjective);
  const symptoms = parseSymptoms(hpi).length
    ? parseSymptoms(hpi)
    : parseSymptoms(draft.subjective);

  const keyFindings = draft.objective?.trim()
    ? draft.objective.split(/[\n•]+/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
    : [];

  return { chiefComplaint, duration, symptoms, keyFindings };
}
