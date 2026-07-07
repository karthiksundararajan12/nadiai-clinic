/**
 * Builds doctor style context from past approved prescriptions for Gemini prompts.
 */

/**
 * @param {Array<{ draft?: Record<string, unknown> }>} prescriptions
 * @returns {string}
 */
export function buildDoctorStyleContext(prescriptions) {
  if (!prescriptions?.length) return "";

  const drugCounts = new Map();
  const durations = [];
  const frequencies = [];
  const advicePhrases = [];

  for (const row of prescriptions) {
    const draft = row.draft ?? {};
    const meds = draft.medications ?? [];

    for (const med of meds) {
      const name = String(med.name ?? "").trim();
      if (name) drugCounts.set(name, (drugCounts.get(name) ?? 0) + 1);

      const duration = String(med.duration ?? "").trim();
      if (duration && duration !== "Not specified") durations.push(duration);

      const frequency = String(med.frequency ?? "").trim();
      if (frequency && frequency !== "Not specified") frequencies.push(frequency);
    }

    const advice = draft.advice ?? [];
    if (Array.isArray(advice)) {
      for (const line of advice) {
        const text = String(line ?? "").trim();
        if (text) advicePhrases.push(text);
      }
    } else if (typeof advice === "string" && advice.trim()) {
      advicePhrases.push(advice.trim());
    }
  }

  const topDrugs = [...drugCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => `${name} (${count}x)`);

  const commonDurations = topValues(durations, 5);
  const commonFrequencies = topValues(frequencies, 5);
  const commonAdvice = topValues(advicePhrases, 5);

  const lines = [];
  if (topDrugs.length) lines.push(`Frequently prescribed drugs: ${topDrugs.join(", ")}`);
  if (commonDurations.length) lines.push(`Common course lengths: ${commonDurations.join(", ")}`);
  if (commonFrequencies.length) lines.push(`Preferred dosage patterns: ${commonFrequencies.join(", ")}`);
  if (commonAdvice.length) lines.push(`Common advice phrases: ${commonAdvice.join("; ")}`);

  return lines.join("\n");
}

/** @param {string[]} values @param {number} limit */
function topValues(values, limit) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([value]) => value);
}
