const EMPTY = { bpSys: "", bpDia: "", hr: "", temp: "", spo2: "", weight: "" };

function normalizeVitalPart(part) {
  const t = String(part ?? "")
    .trim()
    .replace(/\s*mmHg.*$/i, "")
    .trim();
  if (!t || t === "—" || t === "-" || t === "–") return "";
  return t;
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

export function parseVitalsFromObjective(text = "") {
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

export function buildObjectiveWithVitals(vitals, objectiveText = "") {
  const formatted = formatVitalsString(vitals);
  const body = stripVitalsFromObjective(objectiveText);
  if (!formatted) return body;
  return body ? `Vitals: ${formatted}\n\n${body}` : `Vitals: ${formatted}`;
}
