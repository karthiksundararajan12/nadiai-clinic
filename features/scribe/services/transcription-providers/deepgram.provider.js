/**
 * @fileoverview DeepgramProvider — Deepgram Nova-2 implementation of TranscriptionProvider.
 *
 * API used: Deepgram Pre-recorded Audio (batch fallback)
 *   POST https://api.deepgram.com/v1/listen
 *
 * Live streaming is a browser WebSocket to wss://api.deepgram.com/v1/listen,
 * authorized with a 30-second grant from /api/scribe/live-transcription-token.
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
 * Speaker mapping (first-appearance order in audio):
 *   1st distinct Deepgram speaker → Doctor   (A)
 *   2nd → Patient  (B)
 *   3rd → Attendant (C)
 *
 * Uses diarize_model=latest + max_speakers=2 for doctor–patient consultations.
 * Falls back to word-level speaker tags when utterances collapse to one speaker.
 */

import { TranscriptionProvider }   from "./transcription-provider.js";
import { TranscriptionProviderError } from "../../errors.js";
import { TRANSCRIPTION_CONFIG } from "../../constants.js";
import {
  buildAppearanceSpeakerMap,
  buildSegmentsFromDiarizedWords,
  collectDeepgramWords,
  countUniqueSpeakerLabels,
  resolveClinicalSpeaker,
} from "../../lib/speaker-diarization.js";
import { createLogger }             from "../../logger.js";
import {
  DEEPGRAM_LISTEN_HTTP_URL,
  estimateDeepgramCostCents,
  resolveDeepgramLanguage,
  resolveDeepgramModel,
} from "./deepgram-config.js";
import {
  BATCH_DIARIZATION_TIMEOUT_MS,
  DEEPGRAM_MAX_RETRIES,
  DEEPGRAM_RETRY_BACKOFF_MS,
  isDeepgramTimeoutError,
  isTransientDeepgramError,
} from "../../lib/transcription-budget.js";

const log = createLogger({ component: "DeepgramProvider" });

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
    const {
      audioUrl,
      audioBlobs,
      mimeType,
      language,
      sessionId,
      durationSeconds,
      audioSizeBytes,
      timeoutMs,
      signal,
    } = input;

    if (!audioUrl && !audioBlobs?.length) {
      throw new TranscriptionProviderError(
        "DeepgramProvider.transcribe: audioUrl or audio blobs required",
      );
    }

    const model = resolveDeepgramModel(language);
    const deepgramLang = resolveDeepgramLanguage(language);
    const audioBlob = audioBlobs?.[0] ?? null;
    const timeout = timeoutMs ?? BATCH_DIARIZATION_TIMEOUT_MS;

    if (!audioUrl && audioBlobs?.length > 1) {
      log.warn("DeepgramProvider received multiple blobs; only the first is used. Merge chunks upstream.", {
        sessionId,
        chunkCount: audioBlobs.length,
      });
    }

    let lastError = null;
    for (let attempt = 0; attempt <= DEEPGRAM_MAX_RETRIES; attempt++) {
      const startedAt = Date.now();
      log.info("Deepgram request start", {
        sessionId,
        attempt,
        model,
        language: deepgramLang,
        mode: audioUrl ? "signed_url" : "bytes",
        audioSizeBytes: audioSizeBytes ?? audioBlob?.size ?? null,
        durationSeconds: durationSeconds ?? null,
        timeoutMs: timeout,
      });

      try {
        const rawResponse = await this._listenOnce({
          audioUrl,
          audioBlob,
          mimeType,
          language,
          timeoutMs: timeout,
          signal,
        });
        log.info("Deepgram request end", {
          sessionId,
          attempt,
          durationMs: Date.now() - startedAt,
        });
        return this._normalize(rawResponse, { language, durationSeconds, model });
      } catch (err) {
        lastError = err instanceof TranscriptionProviderError
          ? err
          : wrapDeepgramError(err);
        log.warn("Deepgram request failed", {
          sessionId,
          attempt,
          durationMs: Date.now() - startedAt,
          retry: attempt < DEEPGRAM_MAX_RETRIES && isTransientDeepgramError(lastError),
          error: lastError.message,
        });
        if (attempt >= DEEPGRAM_MAX_RETRIES || !isTransientDeepgramError(lastError)) {
          throw lastError;
        }
        await sleep(DEEPGRAM_RETRY_BACKOFF_MS);
      }
    }

    throw lastError ?? new TranscriptionProviderError("Deepgram request failed");
  }

  /**
   * @param {{
   *   audioUrl?: string;
   *   audioBlob?: Blob|null;
   *   mimeType?: string;
   *   language: string;
   *   timeoutMs: number;
   *   signal?: AbortSignal;
   * }} args
   */
  async _listenOnce({ audioUrl, audioBlob, mimeType, language, timeoutMs, signal }) {
    const model = resolveDeepgramModel(language);
    const deepgramLang = resolveDeepgramLanguage(language);
    const params = new URLSearchParams({
      model,
      diarize_model: "latest",
      max_speakers: "2",
      smart_format: "true",
      utterances: "true",
      punctuate: "true",
      paragraphs: "false",
      language: deepgramLang,
    });
    const endpoint = `${DEEPGRAM_LISTEN_HTTP_URL}?${params}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onParentAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener("abort", onParentAbort, { once: true });
    }

    try {
      const httpResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Token ${this._apiKey}`,
          "Content-Type": audioUrl ? "application/json" : (mimeType ?? "audio/webm"),
        },
        body: audioUrl ? JSON.stringify({ url: audioUrl }) : audioBlob,
        signal: controller.signal,
      });

      if (!httpResponse.ok) {
        const body = await httpResponse.text().catch(() => "(unreadable)");
        throw new TranscriptionProviderError(
          `Deepgram API error ${httpResponse.status}: ${body}`,
          { status: httpResponse.status, body },
        );
      }

      return await httpResponse.json();
    } catch (err) {
      if (err instanceof TranscriptionProviderError) throw err;
      if (isDeepgramTimeoutError(err)) {
        const timeoutErr = new TranscriptionProviderError(
          `Deepgram request timed out after ${timeoutMs}ms`,
          { status: 0, timeoutMs },
        );
        timeoutErr.code = "DEEPGRAM_TIMEOUT";
        throw timeoutErr;
      }
      throw wrapDeepgramError(err);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onParentAbort);
    }
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
    const detectedLanguage = metadata.detected_language       ?? resolveDeepgramLanguage(language) ?? null;
    const fullText         = (alternative0?.transcript ?? "").trim();

    const allWords = collectDeepgramWords(utterances, alternative0);
    const appearanceMap = buildAppearanceSpeakerMap(
      allWords.length ? allWords : utterances,
    );

    /** @type {import('./transcription-provider.js').NormalizedSegment[]} */
    let segments = utterances.map((utt, index) => {
      const role       = resolveClinicalSpeaker(utt.speaker, appearanceMap);
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
          source:           "utterance",
        },
      };
    });

    const wordSegments = buildSegmentsFromDiarizedWords(allWords, appearanceMap);
    const utteranceDgSpeakers = new Set(
      utterances.map((u) => u.speaker).filter((s) => typeof s === "number"),
    );
    const wordDgSpeakers = new Set(
      allWords.map((w) => w.speaker).filter((s) => typeof s === "number"),
    );

    if (
      wordSegments.length > 0 &&
      (wordDgSpeakers.size > utteranceDgSpeakers.size ||
        countUniqueSpeakerLabels(segments) < 2)
    ) {
      segments = wordSegments.map((seg, index) => ({ ...seg, index, id: String(index) }));
      log.info("Using word-level diarization segments", {
        utteranceSpeakers: utteranceDgSpeakers.size,
        wordSpeakers: wordDgSpeakers.size,
        segmentCount: segments.length,
      });
    }

    if (countUniqueSpeakerLabels(segments) < 2) {
      log.warn(
        "Transcript has fewer than 2 speakers — ensure both doctor and patient are audible on the recording",
        {
          uniqueLabels: [...new Set(segments.map((s) => s.speaker_label))],
          deepgramSpeakerIds: [...wordDgSpeakers],
        },
      );
    }

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
      costCents:       estimateDeepgramCostCents(detectedDuration, model),
    };
  }
}

function roundSeconds(value) {
  return Number(Number(value).toFixed(3));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value)));
}

function wrapDeepgramError(err) {
  if (err instanceof TranscriptionProviderError) return err;
  return new TranscriptionProviderError(
    `Deepgram request failed: ${err instanceof Error ? err.message : String(err)}`,
  );
}

/** @param {number} ms */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
