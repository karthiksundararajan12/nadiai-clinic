const EMPTY = { bpSys: "", bpDia: "", hr: "", temp: "", spo2: "", weight: "" };

/** SOAP Objective fallback when nothing clinical was captured in the transcript. */
const NOT_DOCUMENTED_RE = /^not documented in transcript\.?$/i;

function normalizeVitalPart(part) {
  const t = String(part ?? "")
    .trim()
    .replace(/\s*mmHg.*$/i, "")
    .trim();
  if (!t || t === "—" || t === "-" || t === "–") return "";
  return t;
}

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
  if (vitals.temp) parts.push(`Temp: ${vitals.temp} °F`);
  if (vitals.spo2) parts.push(`SpO2: ${vitals.spo2}%`);
  if (vitals.weight) parts.push(`Weight: ${vitals.weight} kg`);
  return parts.join(" | ");
}

/**
 * Parse structured vitals from the Objective field.
 * When the draft body is the "Not documented in transcript." fallback, always
 * return empty fields — never surface hallucinated or stale Vitals: lines.
 *
 * @param {string} [text]
 */
export function parseVitalsFromObjective(text = "") {
  const body = stripVitalsFromObjective(text);
  if (isObjectiveNotDocumented(body) || isObjectiveNotDocumented(text)) {
    return { ...EMPTY };
  }

  const line = String(text).split("\n").find((l) => l.startsWith("Vitals:"));
  if (!line) return { ...EMPTY };
  const vitals = { ...EMPTY };

  const bp = line.match(/BP:\s*([^/|]+)\/([^|]+)/);
  if (bp) {
    vitals.bpSys = normalizeVitalPart(bp[1]);
    vitals.bpDia = normalizeVitalPart(bp[2]);
  }

  const hr = line.match(/HR:\s*(\d+)/);
  if (hr) vitals.hr = hr[1];
  const temp = line.match(/Temp:\s*([\d.]+)/);
  if (temp) vitals.temp = temp[1];
  const spo2 = line.match(/SpO2:\s*(\d+)/);
  if (spo2) vitals.spo2 = spo2[1];
  const weight = line.match(/Weight:\s*([\d.]+)/);
  if (weight) vitals.weight = weight[1];
  return vitals;
}

export function stripVitalsFromObjective(text = "") {
  return String(text)
    .split("\n")
    .filter((l) => !l.startsWith("Vitals:"))
    .join("\n")
    .trim();
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
  if (isObjectiveNotDocumented(body)) {
    // Do not re-attach vitals on top of the not-documented fallback.
    return body;
  }
  const formatted = formatVitalsString(vitals);
  if (!formatted) return body;
  return body ? `Vitals: ${formatted}\n\n${body}` : `Vitals: ${formatted}`;
}
