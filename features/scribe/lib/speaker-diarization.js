/**
 * @fileoverview Maps Deepgram diarization IDs to clinical speaker labels.
 * Uses order of first appearance: 1st speaker → Doctor, 2nd → Patient, 3rd → Attendant.
 */

import { TRANSCRIPTION_CONFIG } from "../constants.js";

/** @type {Array<{ key: string; label: string }>} */
export const CLINICAL_SPEAKER_ROLES = [
  { key: "A", label: "Doctor" },
  { key: "B", label: "Patient" },
  { key: "C", label: "Attendant" },
];

export const UNKNOWN_SPEAKER_ROLE = { key: "U", label: "Unknown" };

/**
 * Builds Deepgram speaker ID → clinical role from first-appearance order in the audio.
 * @param {Iterable<{ speaker?: number|null }>} items
 * @returns {Map<number, { key: string; label: string }>}
 */
export function buildAppearanceSpeakerMap(items) {
  /** @type {number[]} */
  const order = [];
  for (const item of items) {
    const id = item.speaker;
    if (typeof id !== "number") continue;
    if (!order.includes(id)) order.push(id);
  }
  /** @type {Map<number, { key: string; label: string }>} */
  const map = new Map();
  order.forEach((dgId, idx) => {
    map.set(dgId, CLINICAL_SPEAKER_ROLES[idx] ?? UNKNOWN_SPEAKER_ROLE);
  });
  return map;
}

/**
 * @param {number|null|undefined} deepgramSpeaker
 * @param {Map<number, { key: string; label: string }>} appearanceMap
 */
export function resolveClinicalSpeaker(deepgramSpeaker, appearanceMap) {
  if (typeof deepgramSpeaker !== "number") return UNKNOWN_SPEAKER_ROLE;
  return appearanceMap.get(deepgramSpeaker) ?? UNKNOWN_SPEAKER_ROLE;
}

/**
 * @typedef {Object} DeepgramWord
 * @property {string} [word]
 * @property {string} [punctuated_word]
 * @property {number} [start]
 * @property {number} [end]
 * @property {number} [confidence]
 * @property {number} [speaker]
 */

/**
 * Splits word-level diarization into segments when speaker changes.
 * More reliable than utterance-level when Deepgram collapses to one speaker.
 *
 * @param {DeepgramWord[]} words
 * @param {Map<number, { key: string; label: string }>} appearanceMap
 */
export function buildSegmentsFromDiarizedWords(words, appearanceMap) {
  if (!words?.length) return [];

  /** @type {import('../services/transcription-providers/transcription-provider.js').NormalizedSegment[]} */
  const segments = [];
  /** @type {DeepgramWord[]} */
  let chunk = [];
  let chunkSpeaker = words[0].speaker;

  const flush = () => {
    if (!chunk.length) return;
    const role = resolveClinicalSpeaker(chunkSpeaker, appearanceMap);
    const text = chunk
      .map((w) => (w.punctuated_word ?? w.word ?? "").trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    if (!text) {
      chunk = [];
      return;
    }
    const confidences = chunk.map((w) => w.confidence ?? 0.9);
    const confidence = clamp(
      confidences.reduce((a, b) => a + b, 0) / confidences.length,
    );

    segments.push({
      id: String(segments.length),
      index: segments.length,
      start: roundSeconds(chunk[0].start ?? 0),
      end: roundSeconds(chunk[chunk.length - 1].end ?? chunk[0].start ?? 0),
      text,
      speaker: role.key,
      speaker_label: role.label,
      confidence,
      is_low_confidence: confidence < TRANSCRIPTION_CONFIG.LOW_CONFIDENCE_THRESHOLD,
      provider_metadata: {
        deepgram_speaker: chunkSpeaker ?? null,
        source: "word_diarization",
        word_count: chunk.length,
      },
    });
    chunk = [];
  };

  for (const word of words) {
    if (chunk.length && word.speaker !== chunkSpeaker) {
      flush();
      chunkSpeaker = word.speaker;
    }
    chunk.push(word);
  }
  flush();

  return segments;
}

/**
 * @param {Array<{ words?: DeepgramWord[]; speaker?: number }>} utterances
 * @param {{ words?: DeepgramWord[] }} [alternative]
 */
export function collectDeepgramWords(utterances, alternative) {
  const fromUtterances = (utterances ?? []).flatMap((u) => u.words ?? []);
  if (fromUtterances.length) return fromUtterances;
  return alternative?.words ?? [];
}

/**
 * @param {import('../services/transcription-providers/transcription-provider.js').NormalizedSegment[]} segments
 */
export function countUniqueSpeakerLabels(segments) {
  return new Set(segments.map((s) => s.speaker_label)).size;
}

function roundSeconds(value) {
  return Number(Number(value).toFixed(3));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}
