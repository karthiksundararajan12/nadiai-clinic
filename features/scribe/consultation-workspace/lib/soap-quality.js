import { getSoapClinicalWarnings, hasBlockingSoapWarnings } from "./clinical-safety.js";
import { stripVitalsFromObjective } from "./vitals-objective.js";

/**
 * Doctor-entered vitals should not affect AI confidence scoring.
 * @param {Record<string, string>} draft
 */
function draftForQualityScoring(draft = {}) {
  const objective = stripVitalsFromObjective(draft.objective ?? "");
  return { ...draft, objective };
}

/**
 * @param {Record<string, string>} draft
 * @param {Array<{ confidence?: number; is_low_confidence?: boolean }>} segments
 * @returns {{ level: "high"|"review"|"low"; label: string; description: string } | null}
 */
export function computeSoapQuality(draft, segments = []) {
  const scoredDraft = draftForQualityScoring(draft);
  const hasDraftContent = Object.values(scoredDraft).some((v) => String(v ?? "").trim());
  if (!hasDraftContent || segments.length === 0) return null;

  const warnings = getSoapClinicalWarnings(scoredDraft);
  const blocking = hasBlockingSoapWarnings(warnings);
  const emptyCount = warnings.length;

  const withConf = segments.filter((s) => typeof s.confidence === "number");
  const avgConf = withConf.length
    ? withConf.reduce((s, x) => s + x.confidence, 0) / withConf.length
    : 0.85;
  const lowSegs = segments.filter((s) => s.is_low_confidence).length;
  const lowRatio = segments.length > 0 ? lowSegs / segments.length : 0;

  if (blocking || emptyCount >= 3 || avgConf < 0.45 || lowRatio > 0.4) {
    return {
      level: "low",
      label: "Low Confidence",
      description: "Several sections need clinical review before approval.",
    };
  }

  if (emptyCount > 0 || avgConf < 0.72 || lowSegs > 0) {
    return {
      level: "review",
      label: "Review Required",
      description: "Note is usable but please verify highlighted sections.",
    };
  }

  return {
    level: "high",
    label: "High Confidence",
    description: "SOAP note aligns well with the consultation transcript.",
  };
}
