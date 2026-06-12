/**
 * Statement-level SOAP ↔ transcript evidence mapping.
 *
 * @typedef {"full"|"partial"|"none"} EvidenceStatus
 *
 * @typedef {Object} SoapStatementEvidence
 * @property {string} soapStatementId
 * @property {string} sectionKey
 * @property {string} statementText
 * @property {string|null} transcriptSegmentId
 * @property {string|null} evidenceText
 * @property {number} confidence - 0–100
 * @property {EvidenceStatus} status
 * @property {string|null} speaker
 */

const FALLBACK_PATTERNS = [
  /^not documented/i,
  /^assessment not documented/i,
  /^plan not documented/i,
  /^no .+ documented/i,
];

/**
 * @param {string} sectionKey
 * @param {string} text
 * @returns {Array<{ id: string; sectionKey: string; text: string }>}
 */
export function splitSectionIntoStatements(sectionKey, text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];

  const lines = trimmed
    .split(/\n+/)
    .map((line) => line.replace(/^[\s•\-*]+/, "").trim())
    .filter(Boolean);

  /** @type {Array<{ id: string; sectionKey: string; text: string }>} */
  const statements = [];

  for (const line of lines) {
    if (FALLBACK_PATTERNS.some((p) => p.test(line))) {
      statements.push({
        id: `${sectionKey}-${statements.length}`,
        sectionKey,
        text: line,
      });
      continue;
    }

    const sentences = line
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);

    const parts = sentences.length > 0 ? sentences : [line];
    for (const part of parts) {
      statements.push({
        id: `${sectionKey}-${statements.length}`,
        sectionKey,
        text: part,
      });
    }
  }

  return statements.map((s, index) => ({
    ...s,
    id: `${sectionKey}-${index}`,
  }));
}

/**
 * @param {string} text
 */
function tokenize(text) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

/**
 * @param {string} statementText
 * @param {Array<{ id: string; text?: string; confidence?: number; speaker_label?: string; speaker?: string }>} segments
 */
function findBestSegmentMatch(statementText, segments) {
  const stmtTokens = tokenize(statementText);
  if (stmtTokens.size === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const segment of segments) {
    const segText = segment.text ?? "";
    const segTokens = tokenize(segText);
    if (segTokens.size === 0) continue;

    let overlap = 0;
    for (const token of stmtTokens) {
      if (segTokens.has(token)) overlap += 1;
    }

    const score = overlap / stmtTokens.size;
    if (score > bestScore) {
      bestScore = score;
      best = { segment, score };
    }
  }

  return best;
}

/**
 * @param {{ id: string; sectionKey: string; text: string }} statement
 * @param {Array<{ id: string; text?: string; confidence?: number; speaker_label?: string; speaker?: string }>} segments
 * @returns {SoapStatementEvidence}
 */
export function computeStatementEvidence(statement, segments) {
  const isFallback = FALLBACK_PATTERNS.some((p) => p.test(statement.text));
  if (isFallback) {
    return {
      soapStatementId: statement.id,
      sectionKey: statement.sectionKey,
      statementText: statement.text,
      transcriptSegmentId: null,
      evidenceText: null,
      confidence: 0,
      status: "none",
      speaker: null,
    };
  }

  const match = findBestSegmentMatch(statement.text, segments);
  if (!match || match.score < 0.08) {
    return {
      soapStatementId: statement.id,
      sectionKey: statement.sectionKey,
      statementText: statement.text,
      transcriptSegmentId: null,
      evidenceText: null,
      confidence: 0,
      status: "none",
      speaker: null,
    };
  }

  const { segment, score } = match;
  const overlapPct = Math.round(score * 100);
  const segmentPct =
    typeof segment.confidence === "number"
      ? Math.round(segment.confidence * 100)
      : overlapPct;
  const confidence = Math.round(overlapPct * 0.55 + segmentPct * 0.45);

  let status = /** @type {EvidenceStatus} */ ("none");
  if (score >= 0.3 && confidence >= 70) status = "full";
  else if (score >= 0.1 || confidence >= 35) status = "partial";

  const speaker = resolveSpeakerLabel(segment);

  return {
    soapStatementId: statement.id,
    sectionKey: statement.sectionKey,
    statementText: statement.text,
    transcriptSegmentId: segment.id,
    evidenceText: segment.text ?? null,
    confidence,
    status,
    speaker,
  };
}

/**
 * @param {{ speaker_label?: string; speaker?: string }} segment
 */
function resolveSpeakerLabel(segment) {
  const label = segment.speaker_label ?? segment.speaker ?? "";
  if (label === "Doctor" || label === "A") return "Doctor";
  if (label === "Patient" || label === "B") return "Patient";
  if (label === "Attendant" || label === "C") return "Attendant";
  return label || "Unknown";
}

/**
 * @param {Record<string, string>} draft
 * @param {Array<{ id: string; text?: string; confidence?: number; speaker_label?: string; speaker?: string }>} segments
 * @param {SoapStatementEvidence[]} [storedMappings]
 * @returns {SoapStatementEvidence[]}
 */
export function buildStatementEvidenceMappings(draft, segments, storedMappings = []) {
  const storedById = new Map(storedMappings.map((m) => [m.soapStatementId, m]));
  /** @type {SoapStatementEvidence[]} */
  const mappings = [];

  for (const [sectionKey, value] of Object.entries(draft ?? {})) {
    const statements = splitSectionIntoStatements(sectionKey, value);
    for (const statement of statements) {
      const stored = storedById.get(statement.id);
      if (stored && stored.statementText === statement.text && stored.transcriptSegmentId) {
        const segment = segments.find((s) => s.id === stored.transcriptSegmentId);
        if (segment) {
          mappings.push({
            ...stored,
            evidenceText: segment.text ?? stored.evidenceText,
            speaker: resolveSpeakerLabel(segment),
          });
          continue;
        }
      }
      mappings.push(computeStatementEvidence(statement, segments));
    }
  }

  return mappings;
}

/**
 * @param {SoapStatementEvidence[]} mappings
 * @param {string} sectionKey
 */
export function getSectionEvidenceMappings(mappings, sectionKey) {
  return mappings.filter((m) => m.sectionKey === sectionKey);
}

/**
 * @param {SoapStatementEvidence} evidence
 */
export function isLowConfidence(evidence) {
  return evidence.confidence > 0 && evidence.confidence < 70;
}

/**
 * @param {string} sectionKey
 * @param {string} sectionText
 * @param {string} statementText
 */
export function removeStatementFromSection(sectionKey, sectionText, statementText) {
  const lines = String(sectionText ?? "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const filtered = lines.filter((line) => {
    const normalized = line.replace(/^[\s•\-*]+/, "").trim();
    return normalized !== statementText.trim();
  });

  return filtered.join("\n");
}
