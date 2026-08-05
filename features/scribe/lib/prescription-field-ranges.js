/**
 * Preserve clinical ranges in prescription free-text fields (duration, dose).
 *
 * The LLM often collapses "3-4 days" → "3 days" or "500-1000mg" → "500mg".
 * Duration/dose are editable free-text — keep the range as stated in SOAP Plan.
 */

import { splitSoapLines } from "./prescription-soap-seed.js";

const DURATION_RANGE_RE =
  /(\d+)\s*[-–—]\s*(\d+)\s*(days?|weeks?|months?|hours?)\b/i;
const DURATION_SINGLE_RE = /(\d+)\s*(days?|weeks?|months?|hours?)\b/i;
const DOSE_RANGE_RE = /(\d+)\s*[-–—]\s*(\d+)\s*(mg|mcg|g|ml|iu)\b/i;
const DOSE_SINGLE_RE = /(\d+)\s*(mg|mcg|g|ml|iu)\b/i;

/**
 * @param {string} unit
 * @param {boolean} plural
 */
function normalizeTimeUnit(unit, plural) {
  const base = String(unit).toLowerCase().replace(/s$/, "");
  return plural ? `${base}s` : base;
}

/**
 * Extract a duration phrase from free text, preserving ranges.
 * e.g. "Rx: Antibiotics for 3-4 days" → "3-4 days"
 *
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function extractDurationFromText(text) {
  const s = String(text ?? "");
  const range = s.match(DURATION_RANGE_RE);
  if (range) {
    return `${range[1]}-${range[2]} ${normalizeTimeUnit(range[3], true)}`;
  }
  const single = s.match(DURATION_SINGLE_RE);
  if (single) {
    const n = Number(single[1]);
    return `${single[1]} ${normalizeTimeUnit(single[2], n !== 1)}`;
  }
  return null;
}

/**
 * Extract a dose phrase from free text, preserving ranges.
 * e.g. "Amoxicillin 500-1000mg BD" → "500-1000mg"
 *
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function extractDoseFromText(text) {
  const s = String(text ?? "");
  const range = s.match(DOSE_RANGE_RE);
  if (range) {
    return `${range[1]}-${range[2]}${range[3].toLowerCase()}`;
  }
  const single = s.match(DOSE_SINGLE_RE);
  if (single) {
    return `${single[1]}${single[2].toLowerCase()}`;
  }
  return null;
}

/**
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function durationContainsRange(value) {
  return DURATION_RANGE_RE.test(String(value ?? ""));
}

/**
 * @param {string|null|undefined} value
 * @returns {boolean}
 */
export function doseContainsRange(value) {
  return DOSE_RANGE_RE.test(String(value ?? ""));
}

/**
 * True when AI duration looks like the lower bound of a plan range
 * ("3 days" vs plan "3-4 days").
 *
 * @param {string|null|undefined} aiDuration
 * @param {string} planDuration
 */
function isCollapsedDuration(aiDuration, planDuration) {
  if (!durationContainsRange(planDuration)) return false;
  if (durationContainsRange(aiDuration)) return false;
  const plan = String(planDuration).match(DURATION_RANGE_RE);
  const ai = String(aiDuration ?? "").match(DURATION_SINGLE_RE);
  if (!plan || !ai) return false;
  const sameUnit =
    normalizeTimeUnit(plan[3], true) === normalizeTimeUnit(ai[2], true);
  return sameUnit && plan[1] === ai[1];
}

/**
 * True when AI dose looks like the lower bound of a plan range
 * ("500mg" vs plan "500-1000mg").
 *
 * @param {string|null|undefined} aiDose
 * @param {string} planDose
 */
function isCollapsedDose(aiDose, planDose) {
  if (!doseContainsRange(planDose)) return false;
  if (doseContainsRange(aiDose)) return false;
  const plan = String(planDose).match(DOSE_RANGE_RE);
  const ai = String(aiDose ?? "").match(DOSE_SINGLE_RE);
  if (!plan || !ai) return false;
  return plan[3].toLowerCase() === ai[2].toLowerCase() && plan[1] === ai[1];
}

/**
 * @param {string} medName
 * @param {string} line
 */
function medNameMatchesLine(medName, line) {
  const name = String(medName ?? "").trim().toLowerCase();
  if (!name || name === "medicine") return false;
  const lineLower = line.toLowerCase();
  if (lineLower.includes(name)) return true;
  // Brand often appears as first token; also match first significant word.
  const first = name.split(/\s+/)[0];
  return first.length >= 4 && lineLower.includes(first);
}

/**
 * Restore duration/dose ranges from SOAP Plan when the model collapsed them.
 *
 * @param {Array<{ name?: string; dosage?: string; duration?: string; [key: string]: unknown }>} medications
 * @param {string|null|undefined} plan
 * @returns {typeof medications}
 */
export function reconcileMedicationRangesFromPlan(medications, plan) {
  if (!Array.isArray(medications) || medications.length === 0) return medications;
  const lines = splitSoapLines(plan);
  if (!lines.length) return medications;

  const rangedDurationLines = lines.filter((l) => durationContainsRange(l));
  const rangedDoseLines = lines.filter((l) => doseContainsRange(l));

  return medications.map((med) => {
    let next = med;

    const durationLine =
      lines.find((l) => medNameMatchesLine(med.name, l) && extractDurationFromText(l)) ||
      (medications.length === 1 ? rangedDurationLines[0] : null) ||
      (rangedDurationLines.length === 1 ? rangedDurationLines[0] : null);

    if (durationLine) {
      const planDuration = extractDurationFromText(durationLine);
      if (
        planDuration &&
        (isCollapsedDuration(med.duration, planDuration) ||
          (!String(med.duration ?? "").trim() && durationContainsRange(planDuration)))
      ) {
        next = { ...next, duration: planDuration };
      }
    }

    const doseLine =
      lines.find((l) => medNameMatchesLine(med.name, l) && extractDoseFromText(l)) ||
      (medications.length === 1 ? rangedDoseLines[0] : null) ||
      (rangedDoseLines.length === 1 ? rangedDoseLines[0] : null);

    if (doseLine) {
      const planDose = extractDoseFromText(doseLine);
      const currentDose = med.dosage ?? med.dose;
      if (
        planDose &&
        (isCollapsedDose(currentDose, planDose) ||
          (!String(currentDose ?? "").trim() && doseContainsRange(planDose)))
      ) {
        next = { ...next, dosage: planDose };
      }
    }

    return next;
  });
}
