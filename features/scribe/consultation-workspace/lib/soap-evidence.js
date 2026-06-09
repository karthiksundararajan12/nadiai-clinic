import { inferSoapSectionFromSegment } from "./transcript-soap-link.js";
import { CORE_SOAP_SECTIONS } from "./clinical-safety.js";

/**
 * Groups transcript segments as evidence bullets per SOAP section.
 * @param {Array<{ id: string; text?: string; speaker_label?: string }>} segments
 */
export function buildSoapEvidenceMap(segments = []) {
  /** @type {Record<string, Array<{ id: string; text: string; start_seconds?: number }>>} */
  const map = Object.fromEntries(CORE_SOAP_SECTIONS.map(([key]) => [key, []]));

  for (const segment of segments) {
    const section = inferSoapSectionFromSegment(segment);
    const text = (segment.text ?? "").trim();
    if (!text || text.length < 4) continue;
    if (!map[section]) map[section] = [];
    if (map[section].length >= 5) continue;
    map[section].push({
      id: segment.id,
      text: text.length > 120 ? `${text.slice(0, 117)}…` : text,
      start_seconds: segment.start_seconds,
    });
  }

  return map;
}
