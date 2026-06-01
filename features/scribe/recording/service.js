/**
 * @fileoverview RecordingService — thin, testable abstraction over the
 * browser's MediaRecorder and Web Audio APIs.
 *
 * Handles:
 *  - MIME type negotiation across Chrome, Firefox, and Safari (audio/mp4)
 *  - Audio analyser setup for level visualisation
 *  - Pause / resume with Safari quirk detection
 *  - Clean resource release (stream tracks + AudioContext)
 *
 * This class contains NO React or Next.js code — it is a pure browser service.
 */

import {
  MIME_TYPE_PRIORITY,
  AUDIO_CONSTRAINTS,
  ANALYSER_CONFIG,
} from "./constants.js";
import { wrapMediaError, PauseNotSupportedError } from "./errors.js";

export class RecordingService {
  /** @type {MediaRecorder|null} */
  #mediaRecorder = null;

  /** @type {MediaStream|null} */
  #stream = null;

  /** @type {AudioContext|null} */
  #audioContext = null;

  /** @type {AnalyserNode|null} */
  #analyserNode = null;

  /** @type {string} */
  #mimeType = "";

  // ─────────────────────────────────────────────────────────────
  // STATIC CAPABILITIES
  // ─────────────────────────────────────────────────────────────

  /** Returns true if the browser supports the MediaRecorder API. */
  static isSupported() {
    return (
      typeof window !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }

  /**
   * Returns true if the browser supports pausing recordings.
   * Safari < 15.4 and some Android browsers do not implement pause().
   */
  static isPauseSupported() {
    if (!RecordingService.isSupported()) return false;
    // Create a dummy recorder to test — less invasive than feature sniffing UA strings
    try {
      return typeof MediaRecorder.prototype.pause === "function";
    } catch {
      return false;
    }
  }

  /**
   * Picks the best supported MIME type for this browser.
   * Returns empty string if none match (browser picks its own default).
   *
   * @returns {string}
   */
  static getSupportedMimeType() {
    if (!RecordingService.isSupported()) return "";
    for (const type of MIME_TYPE_PRIORITY) {
      try {
        if (MediaRecorder.isTypeSupported(type)) return type;
      } catch {
        // some browsers throw instead of returning false
      }
    }
    return "";
  }

  // ─────────────────────────────────────────────────────────────
  // STREAM + PERMISSION
  // ─────────────────────────────────────────────────────────────

  /**
   * Requests mic permission and acquires the MediaStream.
   * Must be called from a user gesture (click handler) on iOS Safari.
   *
   * @param {string} [deviceId]  Specific device — omit for system default.
   * @returns {Promise<MediaStream>}
   * @throws {RecordingError}
   */
  async requestStream(deviceId) {
    const audioConstraints = {
      ...AUDIO_CONSTRAINTS,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };

    try {
      this.#stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
    } catch (err) {
      throw wrapMediaError(err);
    }

    // Set up the audio analyser — failure here is non-fatal (visualisation optional)
    this.#setupAnalyser();

    return this.#stream;
  }

  // ─────────────────────────────────────────────────────────────
  // ANALYSER
  // ─────────────────────────────────────────────────────────────

  #setupAnalyser() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        // @ts-ignore — webkitAudioContext for Safari < 14.1
        window.webkitAudioContext;

      if (!AudioContextClass) return;

      this.#audioContext = new AudioContextClass();

      // iOS Safari suspends AudioContext until a user gesture — resume it.
      if (this.#audioContext.state === "suspended") {
        this.#audioContext.resume().catch(() => {});
      }

      this.#analyserNode = this.#audioContext.createAnalyser();
      this.#analyserNode.fftSize               = ANALYSER_CONFIG.fftSize;
      this.#analyserNode.smoothingTimeConstant = ANALYSER_CONFIG.smoothingTimeConstant;

      const source = this.#audioContext.createMediaStreamSource(this.#stream);
      source.connect(this.#analyserNode);
    } catch (err) {
      // Analyser failure is non-fatal — log and continue without visualisation
      console.warn("[RecordingService] Could not set up audio analyser:", err?.message);
      this.#analyserNode = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // RECORDING LIFECYCLE
  // ─────────────────────────────────────────────────────────────

  /**
   * Starts recording and fires `onChunk(blob)` every `intervalMs` milliseconds.
   * The first chunk arrives after `intervalMs` ms (not immediately).
   *
   * Must be called after `requestStream()`.
   *
   * @param {(blob: Blob) => void} onChunk
   * @param {number}               [intervalMs=30_000]
   * @returns {string}  The resolved MIME type for this recording.
   * @throws {Error}    If stream is not acquired.
   */
  startRecording(onChunk, intervalMs = 30_000) {
    if (!this.#stream) {
      throw new Error("[RecordingService] startRecording() called before requestStream().");
    }

    const mimeType = RecordingService.getSupportedMimeType();
    const options  = mimeType ? { mimeType } : {};

    try {
      this.#mediaRecorder = new MediaRecorder(this.#stream, options);
    } catch {
      // Fallback: let browser choose format (happens on some Android WebViews)
      this.#mediaRecorder = new MediaRecorder(this.#stream);
    }

    this.#mimeType = this.#mediaRecorder.mimeType || mimeType;

    this.#mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        onChunk(event.data);
      }
    };

    this.#mediaRecorder.onerror = (event) => {
      // MediaRecorder error — bubble up via the "error" event on the stream
      console.error("[RecordingService] MediaRecorder error:", event?.error);
    };

    // timeslice causes ondataavailable to fire every intervalMs.
    // Safari may fire it less frequently — we handle this gracefully.
    this.#mediaRecorder.start(intervalMs);

    return this.#mimeType;
  }

  /**
   * Pauses recording.
   * Throws PauseNotSupportedError when the browser does not implement pause().
   */
  pause() {
    if (!this.#mediaRecorder || this.#mediaRecorder.state !== "recording") return;

    if (typeof this.#mediaRecorder.pause !== "function") {
      throw new PauseNotSupportedError();
    }

    this.#mediaRecorder.pause();
  }

  /** Resumes a paused recording. */
  resume() {
    if (!this.#mediaRecorder || this.#mediaRecorder.state !== "paused") return;
    this.#mediaRecorder.resume();
  }

  /**
   * Stops recording and resolves after the final `ondataavailable` fires.
   * Safe to call when already inactive.
   *
   * @returns {Promise<void>}
   */
  stop() {
    return new Promise((resolve) => {
      if (
        !this.#mediaRecorder ||
        this.#mediaRecorder.state === "inactive"
      ) {
        resolve();
        return;
      }

      this.#mediaRecorder.onstop = () => resolve();
      this.#mediaRecorder.stop();
    });
  }

  // ─────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────

  /**
   * Releases all browser resources (mic track, AudioContext, MediaRecorder).
   * Always call this when the component unmounts or recording is abandoned.
   */
  cleanup() {
    try { this.#mediaRecorder?.stop(); } catch { /* already inactive */ }
    this.#stream?.getTracks().forEach((track) => track.stop());
    this.#audioContext?.close().catch(() => {});

    this.#mediaRecorder = null;
    this.#stream        = null;
    this.#audioContext  = null;
    this.#analyserNode  = null;
    this.#mimeType      = "";
  }

  // ─────────────────────────────────────────────────────────────
  // GETTERS
  // ─────────────────────────────────────────────────────────────

  /** @returns {AnalyserNode|null} */
  get analyserNode() { return this.#analyserNode; }

  /** @returns {string} Resolved MIME type for recorded blobs. */
  get mimeType() { return this.#mimeType; }

  /** @returns {"inactive"|"recording"|"paused"} */
  get recorderState() { return this.#mediaRecorder?.state ?? "inactive"; }
}
