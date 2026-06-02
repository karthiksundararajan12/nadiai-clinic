/**
 * @fileoverview DeepgramProvider — Deepgram Nova-2 implementation of TranscriptionProvider.
 *
 * API used: Deepgram Pre-recorded Audio
 *   POST https://api.deepgram.com/v1/listen
 *
 * Features enabled:
 *   diarize      = true   — native multi-speaker identification
 *   smart_format = true   — punctuation, casing, numerals
 *   utterances   = true   — speaker-separated segment boundaries
 *   punctuate    = true   — sentence-level punctuation
 *
 * Model selection:
 *   english   → nova-2-medical  (optimised for clinical terminology)
 *   hindi     → nova-2          (multilingual base model)
 *   hinglish  → nova-2 + multi  (code-switched language detection)
 *
 * Speaker mapping (first-appearance order from Deepgram):
 *   Speaker 0 → Doctor   (A)
 *   Speaker 1 → Patient  (B)
 *   Speaker 2 → Attendant (C)
 *   Speaker 3+ → Unknown  (U)
 */

import { TranscriptionProvider }   from "./transcription-provider.js";
import { TranscriptionProviderError } from "../../errors.js";
import { SCRIBE_LANGUAGE, TRANSCRIPTION_CONFIG } from "../../constants.js";
import { createLogger }             from "../../logger.js";

const DEEPGRAM_API_URL = "https://api.deepgram.com/v1/listen";
const log = createLogger({ component: "DeepgramProvider" });

/** @type {Record<string, string>} SCRIBE_LANGUAGE → Deepgram language code */
const LANGUAGE_MAP = {
  [SCRIBE_LANGUAGE.ENGLISH]:  "en",
  [SCRIBE_LANGUAGE.HINDI]:    "hi",
  [SCRIBE_LANGUAGE.HINGLISH]: "multi",
};

/** @type {Record<string, string>} SCRIBE_LANGUAGE → best Deepgram model */
const MODEL_MAP = {
  [SCRIBE_LANGUAGE.ENGLISH]:  "nova-2-medical",
  [SCRIBE_LANGUAGE.HINDI]:    "nova-2",
  [SCRIBE_LANGUAGE.HINGLISH]: "nova-2",
};

/** Cost per minute in US cents for each model class */
const COST_CENTS_PER_MINUTE = {
  medical: 0.59,
  general: 0.43,
};

/** @type {Array<{ key: string; label: string }>} Deepgram speaker 0,1,2,3+ → role */
const SPEAKER_ROLES = [
  { key: "A", label: "Doctor"    },
  { key: "B", label: "Patient"   },
  { key: "C", label: "Attendant" },
];
const UNKNOWN_ROLE = { key: "U", label: "Unknown" };

/**
 * Maps Deepgram's integer speaker ID to a clinical role.
 * @param {number|null|undefined} speakerId
 * @returns {{ key: string; label: string }}
 */
function resolveSpeakerRole(speakerId) {
  if (typeof speakerId !== "number") return UNKNOWN_ROLE;
  return SPEAKER_ROLES[speakerId] ?? UNKNOWN_ROLE;
}

export class DeepgramProvider extends TranscriptionProvider {
  /**
   * @param {string} [apiKey] - Falls back to DEEPGRAM_API_KEY env var
   */
  constructor(apiKey) {
    super();
    this._apiKey = apiKey ?? process.env.DEEPGRAM_API_KEY;
    if (!this._apiKey) {
      throw new Error(
        "DeepgramProvider requires DEEPGRAM_API_KEY to be set in environment variables",
      );
    }
  }

  get name() { return "deepgram"; }

  get model() {
    return process.env.DEEPGRAM_MODEL ?? "nova-2-medical";
  }

  /**
   * @param {import('./transcription-provider.js').TranscriptionInput} input
   * @returns {Promise<import('./transcription-provider.js').TranscriptionResult>}
   */
  async transcribe(input) {
    const { audioBlobs, mimeType, language, sessionId, durationSeconds } = input;

    if (!audioBlobs?.length) {
      throw new TranscriptionProviderError(
        "DeepgramProvider.transcribe: no audio blobs provided",
      );
    }

    const model       = MODEL_MAP[language]    ?? (process.env.DEEPGRAM_MODEL ?? "nova-2-medical");
    const deepgramLang = LANGUAGE_MAP[language] ?? "en";

    // Concatenate all chunks — Deepgram processes the full audio at once for
    // the most accurate cross-utterance speaker diarization.
    const audioBlob = audioBlobs.length === 1
      ? audioBlobs[0]
      : new Blob(audioBlobs, { type: mimeType ?? "audio/webm" });

    const params = new URLSearchParams({
      model,
      diarize:      "true",
      smart_format: "true",
      utterances:   "true",
      punctuate:    "true",
      paragraphs:   "false",
      language:     deepgramLang,
    });

    const endpoint = `${DEEPGRAM_API_URL}?${params}`;

    log.info("Deepgram transcription started", {
      sessionId,
      model,
      language: deepgramLang,
      chunkCount: audioBlobs.length,
      totalBytes: audioBlob.size,
    });

    const startedAt = Date.now();
    let rawResponse;

    try {
      const httpResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization:  `Token ${this._apiKey}`,
          "Content-Type": mimeType ?? "audio/webm",
        },
        body: audioBlob,
      });

      if (!httpResponse.ok) {
        const body = await httpResponse.text().catch(() => "(unreadable)");
        throw new TranscriptionProviderError(
          `Deepgram API error ${httpResponse.status}: ${body}`,
          { status: httpResponse.status, body },
        );
      }

      rawResponse = await httpResponse.json();
    } catch (err) {
      if (err instanceof TranscriptionProviderError) throw err;
      throw new TranscriptionProviderError(
        `Deepgram request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const latencyMs = Date.now() - startedAt;
    log.info("Deepgram transcription completed", { sessionId, latencyMs });

    return this._normalize(rawResponse, { language, durationSeconds, model });
  }

  /**
   * Converts the raw Deepgram JSON into the canonical TranscriptionResult.
   *
   * @param {object} raw
   * @param {{ language: string; durationSeconds: number|null; model: string }} opts
   * @returns {import('./transcription-provider.js').TranscriptionResult}
   */
  _normalize(raw, { language, durationSeconds, model }) {
    const metadata     = raw.metadata  ?? {};
    const results      = raw.results   ?? {};
    const utterances   = results.utterances  ?? [];
    const alternative0 = results.channels?.[0]?.alternatives?.[0];

    const detectedDuration = metadata.duration                ?? durationSeconds ?? null;
    const detectedLanguage = metadata.detected_language       ?? LANGUAGE_MAP[language] ?? null;
    const fullText         = (alternative0?.transcript ?? "").trim();

    // ── Build segments from utterances ─────────────────────────────────────
    const segments = utterances.map((utt, index) => {
      const role       = resolveSpeakerRole(utt.speaker);
      const confidence = clamp(utt.confidence ?? 0.9);

      return {
        id:                String(utt.id ?? index),
        index,
        start:             roundSeconds(utt.start ?? 0),
        end:               roundSeconds(utt.end   ?? 0),
        text:              String(utt.transcript  ?? "").trim(),
        speaker:           role.key,
        speaker_label:     role.label,
        confidence,
        is_low_confidence: confidence < TRANSCRIPTION_CONFIG.LOW_CONFIDENCE_THRESHOLD,
        provider_metadata: {
          deepgram_speaker: utt.speaker ?? null,
          channel:          utt.channel ?? 0,
          word_count:       utt.words?.length ?? 0,
        },
      };
    });

    // ── Fallback: single segment when diarization produced no utterances ───
    if (segments.length === 0 && fullText) {
      segments.push({
        id:                "0",
        index:              0,
        start:              0,
        end:                detectedDuration ?? 0,
        text:               fullText,
        speaker:            "A",
        speaker_label:      "Doctor",
        confidence:         clamp(alternative0?.confidence ?? 0.85),
        is_low_confidence:  false,
        provider_metadata:  { deepgram_speaker: null, fallback: true },
      });
    }

    // ── Confidence statistics ───────────────────────────────────────────────
    const lowConfidenceSegments = segments.filter((s) => s.is_low_confidence);
    const confidenceValues      = segments.map((s) => s.confidence);
    const averageConfidence     = confidenceValues.length > 0
      ? Number((confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length).toFixed(4))
      : null;

    // ── Speaker map from actual speakers seen ─────────────────────────────
    const seenSpeakers = [...new Set(segments.map((s) => s.speaker))];
    /** @type {Record<string,string>} */
    const speakerMap   = Object.fromEntries(
      seenSpeakers.map((key) => [
        key,
        segments.find((s) => s.speaker === key)?.speaker_label ?? "Unknown",
      ]),
    );

    return {
      text: fullText,
      language: detectedLanguage,
      model,
      segments,
      speakerMap,
      lowConfidenceSegments,
      averageConfidence,
      confidenceSummary: {
        average:                averageConfidence,
        lowConfidenceThreshold: TRANSCRIPTION_CONFIG.LOW_CONFIDENCE_THRESHOLD,
        lowConfidenceCount:     lowConfidenceSegments.length,
        segmentCount:           segments.length,
      },
      providerResponse: {
        metadata,
        summary: {
          utteranceCount: utterances.length,
          wordCount:      alternative0?.words?.length ?? 0,
          channels:       metadata.channels ?? 1,
          duration:       detectedDuration,
          modelInfo:      metadata.model_info ?? null,
        },
        raw,
      },
      durationSeconds: detectedDuration,
      costCents:       estimateCostCents(detectedDuration, model),
    };
  }
}

/** @param {number|null} seconds @param {string} model */
function estimateCostCents(seconds, model) {
  const rate = model.includes("medical")
    ? COST_CENTS_PER_MINUTE.medical
    : COST_CENTS_PER_MINUTE.general;
  return Math.ceil(((seconds ?? 0) / 60) * rate);
}

function roundSeconds(value) {
  return Number(Number(value).toFixed(3));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}
