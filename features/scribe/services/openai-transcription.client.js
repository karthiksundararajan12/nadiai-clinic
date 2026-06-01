/**
 * @fileoverview OpenAI Speech-to-Text client using fetch.
 *
 * Kept dependency-free to avoid pulling the full SDK into the Next.js app.
 */

import { TranscriptionProviderError } from "../errors.js";
import { TRANSCRIPTION_CONFIG } from "../constants.js";

export class OpenAITranscriptionClient {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.model = process.env.OPENAI_TRANSCRIPTION_MODEL || TRANSCRIPTION_CONFIG.DEFAULT_MODEL;
    this.endpoint = "https://api.openai.com/v1/audio/transcriptions";
  }

  /**
   * @param {{ blob: Blob; filename: string; language?: string|null; prompt?: string|null }} input
   */
  async transcribe(input) {
    if (!this.apiKey) {
      throw new TranscriptionProviderError("OPENAI_API_KEY is not configured");
    }

    const form = new FormData();
    form.append("file", input.blob, input.filename);
    form.append("model", this.model);
    form.append("response_format", TRANSCRIPTION_CONFIG.RESPONSE_FORMAT);
    form.append("timestamp_granularities[]", "segment");

    const language = normalizeLanguage(input.language);
    if (language) form.append("language", language);
    if (input.prompt) form.append("prompt", input.prompt);

    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: form,
    });

    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new TranscriptionProviderError(
        payload?.error?.message || `OpenAI transcription failed with ${res.status}`,
        {
          status: res.status,
          type: payload?.error?.type,
          code: payload?.error?.code,
        },
      );
    }

    return payload;
  }
}

/** @param {string|null|undefined} language */
function normalizeLanguage(language) {
  if (language === "english") return "en";
  if (language === "hindi") return "hi";
  // Hinglish is mixed Hindi + English; let Whisper auto-detect.
  return null;
}
