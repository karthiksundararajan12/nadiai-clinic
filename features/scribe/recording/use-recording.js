"use client";

/**
 * @fileoverview useRecording — master hook that orchestrates the entire
 * recording lifecycle using RecordingService, useRecordingTimer, and
 * local chunk accumulation.
 *
 * Features:
 *  - Start / Pause / Resume / Stop with full state machine
 *  - Auto-stop at configurable max duration
 *  - beforeunload warning while recording is active
 *  - Tab-visibility warning on mobile (OS may kill background recording)
 *  - Safe cleanup on component unmount
 *  - Stable callback refs (no stale closure issues)
 *
 * Usage:
 *   const recording = useRecording({ deviceId });
 *   recording.startRecording();
 */

import {
  useReducer,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";

import { RecordingService }   from "./service.js";
import { wrapMediaError }     from "./errors.js";
import { useRecordingTimer }  from "./use-recording-timer.js";
import {
  RECORDING_STATE,
  RECORDING_LIMITS,
} from "./constants.js";

// ─────────────────────────────────────────────────────────────
// STATE MACHINE (useReducer)
// ─────────────────────────────────────────────────────────────

/** @typedef {import("./errors.js").RecordingError} RecordingError */

/**
 * @typedef {Object} RecordingReducerState
 * @property {string}          recordingState
 * @property {RecordingError|null} error
 * @property {Blob[]}          chunks
 * @property {number}          totalSize
 * @property {string}          mimeType
 */

/** @type {RecordingReducerState} */
const INITIAL_STATE = {
  recordingState: RECORDING_STATE.IDLE,
  error:          null,
  chunks:         [],
  totalSize:      0,
  mimeType:       "",
};

/**
 * @param {RecordingReducerState} state
 * @param {{ type: string; [k: string]: unknown }} action
 * @returns {RecordingReducerState}
 */
function recordingReducer(state, action) {
  switch (action.type) {
    case "REQUEST_PERMISSION":
      return { ...state, recordingState: RECORDING_STATE.REQUESTING, error: null };

    case "RECORDING_STARTED":
      return {
        ...state,
        recordingState: RECORDING_STATE.RECORDING,
        mimeType:       action.mimeType,
        error:          null,
        chunks:         [],
        totalSize:      0,
      };

    case "CHUNK_RECEIVED":
      return {
        ...state,
        chunks:    [...state.chunks, action.blob],
        totalSize: state.totalSize + action.blob.size,
      };

    case "PAUSED":
      return { ...state, recordingState: RECORDING_STATE.PAUSED };

    case "RESUMED":
      return { ...state, recordingState: RECORDING_STATE.RECORDING };

    case "STOPPING":
      return { ...state, recordingState: RECORDING_STATE.STOPPING };

    case "STOPPED":
      return { ...state, recordingState: RECORDING_STATE.STOPPED };

    case "ERROR":
      return {
        ...state,
        recordingState: RECORDING_STATE.ERROR,
        error:          action.error,
      };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "RESET":
      return INITIAL_STATE;

    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {Object} UseRecordingOptions
 * @property {string}   [deviceId]                Audio input device ID.
 * @property {number}   [chunkIntervalMs]          Chunk interval (default 30 s).
 * @property {number}   [maxDurationSeconds]       Auto-stop threshold (default 90 min).
 * @property {(blob: Blob, index: number) => void} [onChunkReady]   Called for each chunk.
 * @property {(chunks: Blob[]) => void}            [onStopped]      Called when fully stopped.
 * @property {(err: RecordingError) => void}       [onError]        Called on errors.
 */

/**
 * @param {UseRecordingOptions} [options={}]
 */
export function useRecording(options = {}) {
  const {
    deviceId,
    chunkIntervalMs    = RECORDING_LIMITS.CHUNK_INTERVAL_MS,
    maxDurationSeconds = RECORDING_LIMITS.MAX_DURATION_SECONDS,
    onChunkReady,
    onStopped,
    onError,
  } = options;

  const [state, dispatch] = useReducer(recordingReducer, INITIAL_STATE);
  const { recordingState, error, chunks, totalSize, mimeType } = state;

  // Stable service ref — persists across renders without causing re-renders
  const serviceRef     = useRef(null);
  const chunkIndexRef  = useRef(0);
  /** Sync mirror of chunks — stopRecording must not read stale reducer state. */
  const chunksRef      = useRef(/** @type {Blob[]} */ ([]));

  // Stable callback refs — prevents stale closures in the service callbacks
  const onChunkReadyRef = useRef(onChunkReady);
  const onStoppedRef    = useRef(onStopped);
  const onErrorRef      = useRef(onError);
  useEffect(() => { onChunkReadyRef.current = onChunkReady; }, [onChunkReady]);
  useEffect(() => { onStoppedRef.current    = onStopped;    }, [onStopped]);
  useEffect(() => { onErrorRef.current      = onError;      }, [onError]);

  // ── Derived state ──────────────────────────────────────────
  const isRecording = recordingState === RECORDING_STATE.RECORDING;
  const isPaused    = recordingState === RECORDING_STATE.PAUSED;
  const isStopped   = recordingState === RECORDING_STATE.STOPPED;
  const isBusy      = recordingState === RECORDING_STATE.REQUESTING ||
                      recordingState === RECORDING_STATE.STOPPING;

  // ── Timer ──────────────────────────────────────────────────
  const isTimerActive = isRecording || isPaused;
  const { duration, formattedDuration } = useRecordingTimer(isTimerActive, isPaused);

  // ── Auto-stop at max duration ──────────────────────────────
  const stopRecording = useCallback(async () => {
    if (!serviceRef.current) return chunksRef.current;
    if (
      recordingState !== RECORDING_STATE.RECORDING &&
      recordingState !== RECORDING_STATE.PAUSED
    ) {
      return chunksRef.current;
    }

    dispatch({ type: "STOPPING" });

    try {
      await serviceRef.current.stop();
      // Final ondataavailable runs before onstop; flush React dispatches.
      await new Promise((resolve) => queueMicrotask(resolve));
    } catch {
      /* already inactive — ignore */
    }

    const finalChunks = [...chunksRef.current];

    serviceRef.current.cleanup();
    serviceRef.current = null;
    chunkIndexRef.current = 0;

    dispatch({ type: "STOPPED" });
    onStoppedRef.current?.(finalChunks);

    return finalChunks;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState]);

  useEffect(() => {
    if (isRecording && duration >= maxDurationSeconds) {
      stopRecording();
    }
  }, [isRecording, duration, maxDurationSeconds, stopRecording]);

  // ── Warning threshold ──────────────────────────────────────
  const isNearLimit = duration >= RECORDING_LIMITS.WARNING_SECONDS;

  // ─────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    if (!RecordingService.isSupported()) {
      const err = new (await import("./errors.js")).BrowserNotSupportedError();
      dispatch({ type: "ERROR", error: err });
      onErrorRef.current?.(err);
      return;
    }

    dispatch({ type: "REQUEST_PERMISSION" });
    chunksRef.current = [];

    const service = new RecordingService();
    serviceRef.current = service;

    try {
      await service.requestStream(deviceId);

      const resolvedMimeType = service.startRecording((blob) => {
        chunksRef.current = [...chunksRef.current, blob];
        dispatch({ type: "CHUNK_RECEIVED", blob });
        onChunkReadyRef.current?.(blob, chunkIndexRef.current++);
      }, chunkIntervalMs);

      dispatch({ type: "RECORDING_STARTED", mimeType: resolvedMimeType });
    } catch (err) {
      const wrapped = wrapMediaError(err);
      dispatch({ type: "ERROR", error: wrapped });
      onErrorRef.current?.(wrapped);
      service.cleanup();
      serviceRef.current = null;
    }
  }, [deviceId, chunkIntervalMs]);

  const pauseRecording = useCallback(() => {
    if (!serviceRef.current || recordingState !== RECORDING_STATE.RECORDING) return;

    try {
      serviceRef.current.pause();
      dispatch({ type: "PAUSED" });
    } catch (err) {
      const wrapped = wrapMediaError(err);
      dispatch({ type: "ERROR", error: wrapped });
      onErrorRef.current?.(wrapped);
    }
  }, [recordingState]);

  const resumeRecording = useCallback(() => {
    if (!serviceRef.current || recordingState !== RECORDING_STATE.PAUSED) return;
    serviceRef.current.resume();
    dispatch({ type: "RESUMED" });
  }, [recordingState]);

  const resetRecording = useCallback(() => {
    serviceRef.current?.cleanup();
    serviceRef.current    = null;
    chunkIndexRef.current = 0;
    chunksRef.current     = [];
    dispatch({ type: "RESET" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  // ─────────────────────────────────────────────────────────────
  // BROWSER LIFECYCLE GUARDS
  // ─────────────────────────────────────────────────────────────

  // Warn the user before navigating away during an active session
  useEffect(() => {
    if (!isRecording && !isPaused) return;
    const handler = (e) => {
      e.preventDefault();
      // returnValue is required for Chrome to show the native dialog
      e.returnValue = "You have an active recording. Leaving will lose your audio.";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isRecording, isPaused]);

  // Detect tab going hidden — on iOS the OS may suspend microphone access
  useEffect(() => {
    if (!isRecording) return;
    const handler = () => {
      if (document.hidden) {
        // We can't prevent the OS from stopping mic access —
        // the hook will still collect whatever the recorder emits,
        // and the user will see the warning banner in the UI.
        console.warn(
          "[useRecording] Tab became hidden during recording. " +
          "iOS may have suspended microphone access.",
        );
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [isRecording]);

  // Cleanup on unmount — never leak the mic stream
  useEffect(() => {
    return () => {
      serviceRef.current?.cleanup();
      serviceRef.current = null;
    };
  }, []);

  // ─────────────────────────────────────────────────────────────
  // RETURN
  // ─────────────────────────────────────────────────────────────

  return useMemo(
    () => ({
      // State
      recordingState,
      error,
      chunks,
      chunkCount:       chunks.length,
      totalSize,
      mimeType,
      duration,
      formattedDuration,
      isNearLimit,
      analyserNode:     serviceRef.current?.analyserNode ?? null,
      pauseSupported:   RecordingService.isPauseSupported(),

      // Actions
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      resetRecording,
      clearError,

      // Derived booleans for clean conditional rendering
      isIdle:      recordingState === RECORDING_STATE.IDLE,
      isRequesting: recordingState === RECORDING_STATE.REQUESTING,
      isRecording,
      isPaused,
      isStopped,
      isBusy,
      hasError:    recordingState === RECORDING_STATE.ERROR,

      // Permission shortcuts
      canStart:  recordingState === RECORDING_STATE.IDLE ||
                 recordingState === RECORDING_STATE.STOPPED ||
                 recordingState === RECORDING_STATE.ERROR,
      canPause:  isRecording,
      canResume: isPaused,
      canStop:   isRecording || isPaused,
    }),
    [
      recordingState, error, chunks, totalSize, mimeType,
      duration, formattedDuration, isNearLimit,
      isRecording, isPaused, isStopped, isBusy,
      startRecording, pauseRecording, resumeRecording,
      stopRecording, resetRecording, clearError,
    ],
  );
}
