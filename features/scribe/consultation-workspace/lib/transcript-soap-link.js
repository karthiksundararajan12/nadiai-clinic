/**
 * Maps transcript segments to the most relevant SOAP section for cross-navigation.
 */

const KEYWORDS = {
  assessment: /\b(diagnos|impression|differential|likely|suspect|rule out)\b/i,
  plan: /\b(prescrib|follow.?up|refer|advise|recommend|investigat|order|tablet|mg|dose)\b/i,
  objective: /\b(bp|blood pressure|pulse|temp|examination|exam|finding|vitals|mmhg)\b/i,
};

/**
 * @param {{ speaker_label?: string; speaker?: string; text?: string }} segment
 * @returns {"subjective"|"objective"|"assessment"|"plan"}
 */
export function inferSoapSectionFromSegment(segment) {
  const text = segment?.text ?? "";

  for (const [section, pattern] of Object.entries(KEYWORDS)) {
    if (pattern.test(text)) return section;
  }

  const label = segment?.speaker_label ?? segment?.speaker ?? "";
  if (label === "Doctor" || label === "A") return "objective";
  if (label === "Patient" || label === "B") return "subjective";
  return "subjective";
}
