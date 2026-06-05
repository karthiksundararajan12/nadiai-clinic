/**
 * @fileoverview TranscriptionProvider — abstract interface that every
 * speech-to-text provider must implement.
 *
 * Supported concrete implementations:
 *   - DeepgramProvider  (primary, nova-2-medical)
 *   - Future: WhisperProvider, AssemblyAIProvider
 */

/**
 * @typedef {Object} TranscriptionInput
 * @property {Blob[]}      audioBlobs      - Ordered audio chunk blobs (all chunks for one session)
 * @property {string}      mimeType        - MIME type shared by all blobs, e.g. 'audio/webm'
 * @property {string}      language        - SCRIBE_LANGUAGE value ('english'|'hindi'|'hinglish')
 * @property {string}      sessionId       - Session ID — used only for logging / audit
 * @property {number|null} durationSeconds - Known audio duration (used as fallback for cost)
 */

/**
 * @typedef {Object} NormalizedSegment
 * @property {string}  id
 * @property {number}  index
 * @property {number}  start               - Offset from start of recording in seconds
 * @property {number}  end
 * @property {string}  text
 * @property {string}  speaker             - Role key: 'A'|'B'|'C'|'U'
 * @property {string}  speaker_label       - Human label: 'Doctor'|'Patient'|'Attendant'|'Unknown'
 * @property {number}  confidence          - 0.0 – 1.0
 * @property {boolean} is_low_confidence
 * @property {Object}  provider_metadata   - Raw provider-specific fields kept for debugging
 */

/**
 * @typedef {Object} TranscriptionResult
 * @property {string}                text
 * @property {string|null}           language              - Detected or requested BCP-47 code
 * @property {string}                model                 - Model identifier used
 * @property {NormalizedSegment[]}   segments
 * @property {Record<string,string>} speakerMap            - e.g. { A: 'Doctor', B: 'Patient' }
 * @property {NormalizedSegment[]}   lowConfidenceSegments
 * @property {number|null}           averageConfidence
 * @property {Object}                confidenceSummary
 * @property {Object}                providerResponse      - Full raw API response for debugging
 * @property {number|null}           durationSeconds       - As reported or estimated by provider
 * @property {number}                costCents             - Estimated cost in US cents
 */

export class TranscriptionProvider {
  /**
   * Human-readable provider name, e.g. 'deepgram'.
   * @returns {string}
   */
  get name() {
    throw new Error(`${this.constructor.name} must implement get name()`);
  }

  /**
   * Model identifier used for transcription, e.g. 'nova-2-medical'.
   * @returns {string}
   */
  get model() {
    throw new Error(`${this.constructor.name} must implement get model()`);
  }

  /**
   * Transcribe all audio blobs and return a normalised result.
   *
   * Contract:
   *  - MUST return real transcript data. No mocks, no fallbacks.
   *  - MUST throw TranscriptionProviderError on API failure.
   *  - MUST store the complete raw API response in result.providerResponse.
   *  - Speaker labels come from provider diarization (first-appearance → Doctor/Patient).
   *
   * @param {TranscriptionInput} input
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribe(input) { // eslint-disable-line no-unused-vars
    throw new Error(`${this.constructor.name} must implement transcribe()`);
  }
}
