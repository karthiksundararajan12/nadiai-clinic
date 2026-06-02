/**
 * @fileoverview createTranscriptionProvider — factory that instantiates the
 * configured transcription provider.
 *
 * Configuration:
 *   TRANSCRIPTION_PROVIDER=deepgram   (default)
 *   TRANSCRIPTION_PROVIDER=openai     (legacy Whisper — requires additional setup)
 *
 * Adding a new provider:
 *   1. Implement TranscriptionProvider in a new file.
 *   2. Add a case to the switch below.
 *   3. Document the required env vars alongside the provider class.
 */

import { DeepgramProvider } from "./deepgram.provider.js";
import { createLogger }     from "../../logger.js";

const log = createLogger({ component: "provider-factory" });

/**
 * Returns the active provider name from environment configuration.
 * @returns {string}
 */
export function resolveTranscriptionProviderName() {
  return (process.env.TRANSCRIPTION_PROVIDER ?? "deepgram").toLowerCase().trim();
}

/**
 * Creates and returns the configured TranscriptionProvider instance.
 *
 * @returns {import('./transcription-provider.js').TranscriptionProvider}
 */
export function createTranscriptionProvider() {
  const name = resolveTranscriptionProviderName();

  switch (name) {
    case "deepgram": {
      log.info("Transcription provider: Deepgram");
      return new DeepgramProvider();
    }

    default: {
      log.warn(
        `Unknown TRANSCRIPTION_PROVIDER '${name}' — falling back to Deepgram`,
      );
      return new DeepgramProvider();
    }
  }
}
