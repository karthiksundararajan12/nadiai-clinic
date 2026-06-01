"use client";

/**
 * RecordButton — context-aware button cluster that changes shape based on
 * the current recording state.
 *
 * Idle / Stopped / Error:  large "Start Recording" button
 * Requesting:              spinner with "Requesting microphone…"
 * Recording:               Pause  +  Stop
 * Paused:                  Resume +  Stop
 * Stopping:                disabled spinner
 */

import { Mic, Pause, Play, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RECORDING_STATE } from "@/features/scribe/recording/constants.js";

/**
 * @param {{
 *   recordingState:  string;
 *   onStart:         () => void;
 *   onPause:         () => void;
 *   onResume:        () => void;
 *   onStop:          () => void;
 *   pauseSupported?: boolean;
 *   disabled?:       boolean;
 *   className?:      string;
 * }} props
 */
export function RecordButton({
  recordingState,
  onStart,
  onPause,
  onResume,
  onStop,
  pauseSupported = true,
  disabled       = false,
  className,
}) {
  const isRequesting = recordingState === RECORDING_STATE.REQUESTING;
  const isRecording  = recordingState === RECORDING_STATE.RECORDING;
  const isPaused     = recordingState === RECORDING_STATE.PAUSED;
  const isStopping   = recordingState === RECORDING_STATE.STOPPING;
  const canStart     =
    recordingState === RECORDING_STATE.IDLE    ||
    recordingState === RECORDING_STATE.STOPPED ||
    recordingState === RECORDING_STATE.ERROR;

  // ── Start button ─────────────────────────────────────────
  if (canStart) {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        aria-label="Start recording"
        className={cn(
          "group relative flex items-center gap-3 rounded-full",
          "bg-rose-600 px-8 py-4 text-white shadow-lg shadow-rose-600/30",
          "text-base font-semibold tracking-wide",
          "transition-all duration-200",
          "hover:bg-rose-500 hover:shadow-rose-500/40 hover:scale-105",
          "active:scale-95",
          "disabled:opacity-50 disabled:pointer-events-none disabled:scale-100",
          className,
        )}
      >
        {/* Ripple ring */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full animate-ping bg-rose-500/30 group-hover:opacity-0"
        />
        <Mic className="size-5 relative z-10" />
        <span className="relative z-10">Start Recording</span>
      </button>
    );
  }

  // ── Requesting permission ────────────────────────────────
  if (isRequesting) {
    return (
      <div
        aria-live="polite"
        aria-label="Requesting microphone access"
        className={cn(
          "flex items-center gap-3 rounded-full",
          "bg-slate-700 px-8 py-4 text-slate-300",
          "text-base font-semibold",
          className,
        )}
      >
        <Loader2 className="size-5 animate-spin" />
        <span>Requesting microphone…</span>
      </div>
    );
  }

  // ── Stopping ─────────────────────────────────────────────
  if (isStopping) {
    return (
      <div
        aria-live="polite"
        aria-label="Stopping recording"
        className={cn(
          "flex items-center gap-3 rounded-full",
          "bg-slate-700 px-8 py-4 text-slate-300",
          "text-base font-semibold",
          className,
        )}
      >
        <Loader2 className="size-5 animate-spin" />
        <span>Finishing…</span>
      </div>
    );
  }

  // ── Recording / Paused — control cluster ─────────────────
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Pause / Resume */}
      {pauseSupported && (
        <button
          type="button"
          onClick={isPaused ? onResume : onPause}
          disabled={disabled}
          aria-label={isPaused ? "Resume recording" : "Pause recording"}
          className={cn(
            "flex items-center gap-2 rounded-full px-5 py-3",
            "text-sm font-semibold transition-all duration-150",
            "disabled:opacity-50 disabled:pointer-events-none",
            "active:scale-95",
            isPaused
              ? "bg-emerald-600 text-white hover:bg-emerald-500 shadow-emerald-600/30 shadow-md"
              : "bg-amber-500 text-white hover:bg-amber-400 shadow-amber-500/30 shadow-md",
          )}
        >
          {isPaused
            ? <><Play  className="size-4" /><span>Resume</span></>
            : <><Pause className="size-4" /><span>Pause</span></>
          }
        </button>
      )}

      {/* Stop */}
      <button
        type="button"
        onClick={onStop}
        disabled={disabled}
        aria-label="Stop recording"
        className={cn(
          "flex items-center gap-2 rounded-full px-5 py-3",
          "bg-rose-600 text-white text-sm font-semibold",
          "hover:bg-rose-500 shadow-rose-600/30 shadow-md",
          "transition-all duration-150 active:scale-95",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        <Square className="size-4 fill-current" />
        <span>Stop</span>
      </button>
    </div>
  );
}
