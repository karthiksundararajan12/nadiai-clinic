/**
 * @fileoverview Constants for the recording feature.
 */

// ─────────────────────────────────────────────────────────────
// RECORDING STATE MACHINE
// ─────────────────────────────────────────────────────────────

/** @enum {string} */
export const RECORDING_STATE = Object.freeze({
  IDLE:       "idle",
  REQUESTING: "requesting",  // waiting for mic permission
  RECORDING:  "recording",
  PAUSED:     "paused",
  STOPPING:   "stopping",
  STOPPED:    "stopped",
  ERROR:      "error",
});

// ─────────────────────────────────────────────────────────────
// MIME TYPE PRIORITY LIST
// Ordered: best quality first, widest compat last.
// Safari only supports audio/mp4 (AAC).
// Chrome/Firefox support audio/webm (Opus).
// ─────────────────────────────────────────────────────────────

export const MIME_TYPE_PRIORITY = Object.freeze([
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2", // Safari
  "audio/mp4",                   // Safari fallback
]);

// ─────────────────────────────────────────────────────────────
// LIMITS
// ─────────────────────────────────────────────────────────────

export const RECORDING_LIMITS = Object.freeze({
  /** Hard stop at 90 minutes to prevent runaway sessions. */
  MAX_DURATION_SECONDS: 90 * 60,

  /** Warning banner threshold (45 minutes). */
  WARNING_SECONDS: 45 * 60,

  /** Chunk interval — 30 s of audio per chunk. Whisper-aligned. */
  CHUNK_INTERVAL_MS: 30_000,

  /** Maximum single-chunk size before warning the user (10 MB). */
  MAX_CHUNK_SIZE_BYTES: 10 * 1024 * 1024,
});

// ─────────────────────────────────────────────────────────────
// AUDIO CONSTRAINTS (passed to getUserMedia)
// 16 kHz mono — optimal for Whisper; reduces bandwidth 75% vs stereo 44.1 kHz.
// ─────────────────────────────────────────────────────────────

export const AUDIO_CONSTRAINTS = Object.freeze({
  echoCancellation:    true,
  noiseSuppression:    true,
  autoGainControl:     true,
  sampleRate:          16_000,
  channelCount:        1,
});

// ─────────────────────────────────────────────────────────────
// ANALYSER
// ─────────────────────────────────────────────────────────────

export const ANALYSER_CONFIG = Object.freeze({
  fftSize:                 256,
  smoothingTimeConstant:   0.8,
  /** Number of animated bars in AudioLevelMeter. */
  BAR_COUNT:               24,
});
