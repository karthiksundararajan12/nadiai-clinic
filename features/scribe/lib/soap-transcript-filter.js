/**
 * Selects which diarized transcript turns are sent to SOAP generation.
 * The full transcript remains stored; this only filters the prompt input.
 */

/**
 * @typedef {{
 *   id: string;
 *   text?: string|null;
 *   speaker_label?: string|null;
 *   speaker?: string|null;
 * }} SoapTranscriptTurn
 *
 * @typedef {{ id: string; clinical: boolean }} ClinicalClassification
 */

/**
 * @param {{
 *   turns?: SoapTranscriptTurn[];
 *   classifications?: ClinicalClassification[];
 *   inclusionOverrides?: Record<string, boolean>;
 *   deletedIds?: string[];
 * }} input
 * @returns {SoapTranscriptTurn[]}
 */
export function selectTurnsForSoap({
  turns = [],
  classifications = [],
  inclusionOverrides = {},
  deletedIds = [],
} = {}) {
  const deleted = new Set((deletedIds ?? []).filter(Boolean));
  const clinicalById = new Map(
    (classifications ?? []).map((row) => [row.id, Boolean(row.clinical)]),
  );

  return (turns ?? []).filter((turn) => {
    if (!turn?.id || deleted.has(turn.id)) return false;
    if (Object.prototype.hasOwnProperty.call(inclusionOverrides ?? {}, turn.id)) {
      return inclusionOverrides[turn.id] === true;
    }
    return clinicalById.get(turn.id) !== false;
  });
}

/**
 * @param {SoapTranscriptTurn[]} turns
 * @returns {string}
 */
export function formatTurnsAsTranscriptText(turns) {
  return (turns ?? [])
    .map((turn) => {
      const speaker = turn.speaker_label ?? turn.speaker ?? "Speaker";
      return `${speaker}: ${turn.text ?? ""}`;
    })
    .join("\n")
    .trim();
}
