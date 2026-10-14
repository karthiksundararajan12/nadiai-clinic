const EMPTY = { bpSys: "", bpDia: "", hr: "", temp: "", spo2: "", weight: "" };

/** Exact Objective string the model must return when the transcript has no findings. */
export const OBJECTIVE_NOT_DOCUMENTED =
  "No objective findings documented in this consultation.";

/** Muted card copy when Objective has nothing to show. */
export const OBJECTIVE_EMPTY_PLACEHOLDER = "No objective findings documented";

/** SOAP Objective fallback when nothing clinical was captured in the transcript. */
const NOT_DOCUMENTED_RE =
  /^(?:not documented in transcript\.?|no objective findings documented(?: in this consultation)?\.?)$/i;

const VITAL_CLAUSE_RES = [
  /\bBP:?\s*\d{2,3}\s*\/\s*\d{2,3}(?:\s*mmHg)?/gi,
  /\b(?:HR|pulse|heart rate):?\s*\d{2,3}(?:\s*bpm)?/gi,
  /\b(?:Temp|temperature):?\s*\d+(?:\.\d+)?(?:\s*°?\s*[FC])?/gi,
  /\bSpO2:?\s*\d{2,3}\s*%?/gi,
  /\b(?:Weight|Wt):?\s*\d+(?:\.\d+)?(?:\s*kg)?/gi,
  /\bHeight:\s*\d+(?:\.\d+)?\s*cm/gi,
  /\b(?:RBS|FBS|PP|Sugar):\s*\d+(?:\.\d+)?(?:\s*(?:mg\/dL|mmol\/L))?/gi,
];

/**
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isObjectiveNotDocumented(text = "") {
  return NOT_DOCUMENTED_RE.test(String(text).trim());
}

export function formatVitalsString(vitals) {
  const parts = [];
  if (vitals.bpSys || vitals.bpDia) {
    parts.push(`BP: ${vitals.bpSys || "—"}/${vitals.bpDia || "—"} mmHg`);
  }
  if (vitals.hr) parts.push(`HR: ${vitals.hr} bpm`);
  if (vitals.temp) {
    const unit = String(vitals.tempUnit || "").toUpperCase() === "C" ? "°C" : "°F";
    parts.push(`Temp: ${vitals.temp} ${unit}`);
  }
  if (vitals.spo2) parts.push(`SpO2: ${vitals.spo2}%`);
  if (vitals.weight) parts.push(`Weight: ${vitals.weight} kg`);
  if (vitals.height) parts.push(`Height: ${vitals.height} cm`);
  if (vitals.sugar) {
    const kind = vitals.sugarType === "fasting"
      ? "FBS"
      : vitals.sugarType === "pp"
        ? "PP"
        : vitals.sugarType === "random"
          ? "RBS"
          : "Sugar";
    const unit = vitals.sugarUnit === "mmol/L" ? "mmol/L" : "mg/dL";
    parts.push(`${kind}: ${vitals.sugar} ${unit}`);
  }
  return parts.join(" | ");
}

/**
 * Parse structured vitals from the Objective field.
 * When the draft body is the "Not documented in transcript." fallback, always
 * return empty fields — never surface hallucinated or stale Vitals: lines.
 *
 * @param {string} [text]
 */
/**
 * Read vitals from either the canonical `Vitals: BP: 120/80 mmHg | HR: 88 bpm`
 * line or the looser prompt form `BP 120/80 mmHg, HR 88 bpm`.
 *
 * @param {string} [text]
 */
export function parseVitalsFromObjective(text = "") {
  const body = stripVitalsFromObjective(text);
  if (isObjectiveNotDocumented(body) || isObjectiveNotDocumented(text)) {
    return { ...EMPTY };
  }
  return parseLooseVitals(String(text));
}

function parseLooseVitals(text) {
  const vitals = { ...EMPTY };
  const bp = text.match(/\bBP:?\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bp) {
    vitals.bpSys = bp[1];
    vitals.bpDia = bp[2];
  }
  const hr = text.match(/\b(?:HR|pulse|heart rate):?\s*(\d{2,3})\b/i);
  if (hr) vitals.hr = hr[1];
  const temp = text.match(/\b(?:Temp|temperature):?\s*(\d+(?:\.\d+)?)/i);
  if (temp) vitals.temp = temp[1];
  const spo2 = text.match(/\bSpO2:?\s*(\d{2,3})/i);
  if (spo2) vitals.spo2 = spo2[1];
  const weight = text.match(/\b(?:Weight|Wt):?\s*(\d+(?:\.\d+)?)/i);
  if (weight) vitals.weight = weight[1];
  return vitals;
}

function stripVitalClauses(line) {
  let next = line;
  let removed = false;
  for (const pattern of VITAL_CLAUSE_RES) {
    pattern.lastIndex = 0;
    const replaced = next.replace(pattern, "");
    if (replaced !== next) removed = true;
    next = replaced;
  }
  if (!removed) return line.trim();
  return next
    .replace(/\s*[|,]\s*(?=[|,.]|$)/g, "")
    .replace(/^[|\s,;.-]+$/, "")
    .replace(/^\.\s+/, "")
    .replace(/^[|\s,;-]+|[|\s,;-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();
}

export function stripVitalsFromObjective(text = "") {
  return String(text)
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const body = trimmed.replace(/^Vitals:\s*/i, "");
      return stripVitalClauses(trimmed.startsWith("Vitals:") ? body : line);
    })
    .filter((line) => line && !/^vitals:?$/i.test(line))
    .join("\n")
    .trim();
}

function splitExamAndInvestigations(text) {
  const exam = [];
  const investigations = [];
  for (const line of String(text).split("\n")) {
    const match = line.match(/^\s*Investigations:\s*(.*)$/i);
    if (match) {
      if (match[1].trim()) investigations.push(match[1].trim());
    } else if (line.trim()) {
      exam.push(line.trim());
    }
  }
  return {
    exam: exam.join("\n").trim(),
    investigations: investigations.join("; ").trim(),
  };
}

function vitalsFromUnknown(value) {
  if (typeof value === "string") return parseLooseVitals(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY };
  const vitals = { ...EMPTY };
  const bp = String(value.bp ?? value.bloodPressure ?? "");
  const bpMatch = bp.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  vitals.bpSys = String(value.bpSys ?? value.systolic ?? (bpMatch?.[1] ?? "")).replace(/[^\d]/g, "");
  vitals.bpDia = String(value.bpDia ?? value.diastolic ?? (bpMatch?.[2] ?? "")).replace(/[^\d]/g, "");
  const hr = String(value.hr ?? value.heartRate ?? value.pulse ?? "").match(/(\d{2,3})/);
  if (hr) vitals.hr = hr[1];
  const temp = String(value.temp ?? value.temperature ?? "").match(/(\d+(?:\.\d+)?)/);
  if (temp) vitals.temp = temp[1];
  const spo2 = String(value.spo2 ?? value.spO2 ?? value.oxygen ?? "").match(/(\d{2,3})/);
  if (spo2) vitals.spo2 = spo2[1];
  const weight = String(value.weight ?? value.weightKg ?? "").match(/(\d+(?:\.\d+)?)/);
  if (weight) vitals.weight = weight[1];
  return vitals;
}

function publicVitals(vitals) {
  return {
    bpSys: vitals.bpSys ?? "",
    bpDia: vitals.bpDia ?? "",
    hr: vitals.hr ?? "",
    temp: vitals.temp ?? "",
    spo2: vitals.spo2 ?? "",
    weight: vitals.weight ?? "",
  };
}

function finishObjective(vitals, exam, investigations) {
  const cleanExam = isObjectiveNotDocumented(exam) ? "" : String(exam ?? "").trim();
  const cleanInv = String(investigations ?? "").trim();
  const hasVitals = [vitals.bpSys, vitals.bpDia, vitals.hr, vitals.temp, vitals.spo2, vitals.weight, vitals.height, vitals.sugar]
    .some((part) => String(part ?? "").trim());
  const isEmpty = !hasVitals && !cleanExam && !cleanInv;
  const lines = [];
  const vitalsText = formatVitalsString(vitals);
  if (vitalsText) lines.push({ label: "Vitals", text: vitalsText });
  if (cleanExam) lines.push({ label: "Exam", text: cleanExam });
  if (cleanInv) lines.push({ label: "Investigations", text: cleanInv });

  let text = OBJECTIVE_NOT_DOCUMENTED;
  if (!isEmpty) {
    text = buildObjectiveWithVitals(vitals, cleanExam);
    if (cleanInv) {
      text = text ? `${text}\n\nInvestigations: ${cleanInv}` : `Investigations: ${cleanInv}`;
    }
  }

  return {
    vitals: publicVitals(vitals),
    exam: cleanExam,
    investigations: cleanInv,
    isEmpty,
    lines,
    text,
  };
}

/**
 * One normalizer for Objective, whether the model returned a string or
 * `{ vitals, exam, investigations }`.
 *
 * @param {string|Record<string, unknown>|null|undefined} input
 */
function annotateMeasuredVitals(vitals, text) {
  const next = { ...vitals };
  const height = String(text).match(/\bHeight:\s*([\d.]+)\s*cm/i);
  if (height) next.height = height[1];
  if (/Temp:\s*[\d.]+\s*°\s*C\b/i.test(String(text))) next.tempUnit = "C";
  const sugar = String(text).match(/\b(RBS|FBS|PP|Sugar):\s*([\d.]+)\s*(mg\/dL|mmol\/L)/i);
  if (sugar) {
    next.sugar = sugar[2];
    next.sugarUnit = sugar[3].toLowerCase() === "mmol/l" ? "mmol/L" : "mg/dL";
    next.sugarType = sugar[1].toUpperCase() === "FBS"
      ? "fasting"
      : sugar[1].toUpperCase() === "PP"
        ? "pp"
        : sugar[1].toUpperCase() === "RBS"
          ? "random"
          : "";
  }
  return next;
}

export function normalizeObjective(input) {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const looksLikeVitals = "bpSys" in input || "bp" in input || "hr" in input || "heartRate" in input;
    const vitals = vitalsFromUnknown(input.vitals ?? (looksLikeVitals ? input : ""));
    const examSource = [input.exam, input.text, input.objective]
      .filter((part) => typeof part === "string")
      .join("\n");
    const stripped = stripVitalsFromObjective(examSource);
    const parts = splitExamAndInvestigations(stripped);
    const investigations = [input.investigations, parts.investigations]
      .filter((part) => typeof part === "string" && part.trim() && !isObjectiveNotDocumented(part))
      .join("; ");
    if (isObjectiveNotDocumented(stripped) && !investigations) {
      return finishObjective({ ...EMPTY }, "", "");
    }
    return finishObjective(vitals, parts.exam, investigations);
  }

  const text = String(input ?? "").trim();
  if (!text || isObjectiveNotDocumented(text)) {
    return finishObjective({ ...EMPTY }, "", "");
  }
  const vitals = annotateMeasuredVitals(parseVitalsFromObjective(text), text);
  const stripped = stripVitalsFromObjective(text);
  if (isObjectiveNotDocumented(stripped)) {
    return finishObjective({ ...EMPTY }, "", "");
  }
  const parts = splitExamAndInvestigations(stripped);
  return finishObjective(vitals, parts.exam, parts.investigations);
}

/**
 * Fold alias keys into a string `objective` before schema validation.
 * Missing, null, or non-string objective becomes the documented fallback.
 *
 * @param {unknown} parsed
 */
export function prepareSoapNotePayload(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const copy = { ...parsed };
  let raw = copy.objective;
  if (raw == null || raw === "") {
    raw = copy.Objective ?? copy.objective_findings ?? null;
  }
  const missing = raw == null || raw === "" || (typeof raw === "string" && isObjectiveNotDocumented(raw));
  if (missing && (copy.vitals || copy.exam || copy.investigations)) {
    raw = {
      vitals: copy.vitals,
      exam: typeof copy.exam === "string" ? copy.exam : "",
      investigations: typeof copy.investigations === "string" ? copy.investigations : "",
    };
  }
  copy.objective = normalizeObjective(raw ?? "").text;
  delete copy.Objective;
  delete copy.objective_findings;
  delete copy.exam;
  delete copy.vitals;
  delete copy.investigations;
  return copy;
}

/**
 * Drop a structured Vitals: line when the Objective draft says nothing was
 * documented — keeps stored SOAP consistent with empty vitals inputs.
 *
 * @param {string} [text]
 * @returns {string}
 */
export function sanitizeObjectiveVitals(text = "") {
  const body = stripVitalsFromObjective(text);
  if (isObjectiveNotDocumented(body) || isObjectiveNotDocumented(text)) {
    return body || "Not documented in transcript.";
  }
  return String(text);
}

export function buildObjectiveWithVitals(vitals, objectiveText = "") {
  const body = stripVitalsFromObjective(objectiveText);
  const formatted = formatVitalsString(vitals);
  if (!formatted) return body;
  // Doctor-entered vitals (especially weight for pediatric dosing) must persist
  // even when the AI Objective fallback is "Not documented in transcript."
  // Hallucinated AI vitals are still stripped by sanitizeObjectiveVitals.
  if (isObjectiveNotDocumented(body)) {
    return `Vitals: ${formatted}`;
  }
  return body ? `Vitals: ${formatted}\n\n${body}` : `Vitals: ${formatted}`;
}
