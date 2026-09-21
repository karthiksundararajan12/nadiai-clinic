/**
 * Merges Deepgram live Results messages into UI segments + a SOAP-ready transcript.
 * Interim (is_final: false) is a single trailing draft; finals are committed in order.
 */

import { TRANSCRIPTION_CONFIG } from "../constants.js";
import {
  buildAppearanceSpeakerMap,
  buildSegmentsFromDiarizedWords,
  resolveClinicalSpeaker,
} from "./speaker-diarization.js";

/**
 * @typedef {Object} LiveFinalUtterance
 * @property {string} text
 * @property {number} start
 * @property {number} end
 * @property {number} confidence
 * @property {unknown[]} words
 */

export function createLiveTranscriptAccumulator() {
  /** @type {LiveFinalUtterance[]} */
  const finals = [];
  /** @type {LiveFinalUtterance|null} */
  let interim = null;
  /** @type {unknown[]} */
  const rawMessages = [];

  function applyResult(message) {
    if (!message || message.type === "UtteranceEnd" || message.type === "SpeechStarted") {
      return snapshot();
    }
    if (message.type && message.type !== "Results") {
      return snapshot();
    }

    rawMessages.push(message);

    const alt = message.channel?.alternatives?.[0];
    const text = String(alt?.transcript ?? "").trim();
    const start = Number(message.start ?? 0);
    const duration = Number(message.duration ?? 0);
    const entry = {
      text,
      start,
      end: start + duration,
      confidence: clamp(alt?.confidence ?? 0.9),
      words: Array.isArray(alt?.words) ? alt.words : [],
    };

    if (message.is_final) {
      if (text) finals.push(entry);
      interim = null;
    } else {
      interim = text ? entry : null;
    }

    return snapshot();
  }

  function snapshot() {
    const committed = buildCommittedSegments(finals);
    /** @type {import('../services/transcription-providers/transcription-provider.js').NormalizedSegment[]} */
    const segments = committed.map((seg) => ({ ...seg, is_interim: false }));

    if (interim?.text) {
      const appearanceMap = buildAppearanceSpeakerMap(
        finals.flatMap((f) => f.words).concat(interim.words),
      );
      const role = resolveClinicalSpeaker(firstSpeakerId(interim.words), appearanceMap);
      segments.push({
        id: "interim",
        index: segments.length,
        start: roundSeconds(interim.start),
        end: roundSeconds(interim.end),
        start_seconds: roundSeconds(interim.start),
        end_seconds: roundSeconds(interim.end),
        text: interim.text,
        speaker: role.key,
        speaker_label: role.label,
        confidence: interim.confidence,
        is_low_confidence: false,
        is_interim: true,
        provider_metadata: { source: "live_interim" },
      });
    }

    const text = finals.map((f) => f.text).filter(Boolean).join(" ").trim();
    return { segments, text, interimText: interim?.text ?? "", finals };
  }

  /**
   * @param {{ language?: string; durationSeconds?: number|null; model?: string }} [opts]
   */
  function toTranscriptionResult(opts = {}) {
    const { segments, text } = snapshot();
    const committed = segments.filter((s) => !s.is_interim);
    const model = opts.model ?? TRANSCRIPTION_CONFIG.DEFAULT_MODEL;
    const durationSeconds = opts.durationSeconds ?? lastEnd(committed);
    const lowConfidenceSegments = committed.filter((s) => s.is_low_confidence);
    const confidenceValues = committed.map((s) => s.confidence);
    const averageConfidence = confidenceValues.length
      ? Number(
        (confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length).toFixed(4),
      )
      : null;
    const seenSpeakers = [...new Set(committed.map((s) => s.speaker))];
    const speakerMap = Object.fromEntries(
      seenSpeakers.map((key) => [
        key,
        committed.find((s) => s.speaker === key)?.speaker_label ?? "Unknown",
      ]),
    );

    return {
      text,
      language: opts.language ?? null,
      model,
      segments: committed.map((seg, index) => ({
        ...seg,
        id: String(index),
        index,
        is_interim: undefined,
      })),
      speakerMap,
      lowConfidenceSegments,
      averageConfidence,
      confidenceSummary: {
        average: averageConfidence,
        lowConfidenceThreshold: TRANSCRIPTION_CONFIG.LOW_CONFIDENCE_THRESHOLD,
        lowConfidenceCount: lowConfidenceSegments.length,
        segmentCount: committed.length,
      },
      providerResponse: {
        source: "live",
        summary: { utteranceCount: finals.length, duration: durationSeconds },
        raw: rawMessages.slice(-50),
      },
      durationSeconds,
      costCents: Math.ceil(
        ((durationSeconds ?? 0) / 60) * TRANSCRIPTION_CONFIG.DEFAULT_COST_PER_AUDIO_MINUTE_CENTS,
      ),
    };
  }

  return { applyResult, snapshot, toTranscriptionResult };
}

/**
 * @param {LiveFinalUtterance[]} finals
 */
function buildCommittedSegments(finals) {
  const allWords = finals.flatMap((f) => f.words ?? []);
  const appearanceMap = buildAppearanceSpeakerMap(allWords.length ? allWords : finals);
  const wordSegments = buildSegmentsFromDiarizedWords(allWords, appearanceMap);

  if (wordSegments.length > 1) {
    return wordSegments.map((seg, index) => ({
      ...seg,
      index,
      id: String(index),
      start_seconds: seg.start,
      end_seconds: seg.end,
    }));
  }

  return finals.map((utt, index) => {
    const role = resolveClinicalSpeaker(firstSpeakerId(utt.words), appearanceMap);
    const confidence = clamp(utt.confidence);
    return {
      id: String(index),
      index,
      start: roundSeconds(utt.start),
      end: roundSeconds(utt.end),
      start_seconds: roundSeconds(utt.start),
      end_seconds: roundSeconds(utt.end),
      text: utt.text,
      speaker: role.key,
      speaker_label: role.label,
      confidence,
      is_low_confidence: confidence < TRANSCRIPTION_CONFIG.LOW_CONFIDENCE_THRESHOLD,
      provider_metadata: {
        source: "live_final",
        word_count: utt.words?.length ?? 0,
        deepgram_speaker: firstSpeakerId(utt.words),
      },
    };
  });
}

function firstSpeakerId(words) {
  const found = (words ?? []).find((w) => typeof w?.speaker === "number");
  return found?.speaker ?? null;
}

function lastEnd(segments) {
  if (!segments.length) return null;
  return segments[segments.length - 1].end ?? null;
}

function roundSeconds(value) {
  return Number(Number(value).toFixed(3));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}
