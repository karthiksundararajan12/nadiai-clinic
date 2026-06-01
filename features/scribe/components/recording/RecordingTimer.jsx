"use client";

/**
 * RecordingTimer — displays the elapsed recording time with a status indicator.
 *
 * Shows:
 *  - Pulsing red dot + time while recording
 *  - Static amber dot + time while paused
 *  - Warning banner when approaching the 45-minute limit
 *  - Nothing while idle
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * @param {{
 *   formattedDuration: string;
 *   isRecording:       boolean;
 *   isPaused:          boolean;
 *   isNearLimit?:      boolean;
 *   className?:        string;
 * }} props
 */
export function RecordingTimer({
  formattedDuration,
  isRecording,
  isPaused,
  isNearLimit = false,
  className,
}) {
  const isVisible = isRecording || isPaused;
  if (!isVisible) return null;

  return (
    <div
      role="timer"
      aria-live="off"
      aria-label={`Recording time: ${formattedDuration}`}
      className={cn("flex flex-col items-center gap-2", className)}
    >
      {/* Time display */}
      <div className="flex items-center gap-3">
        {/* Status dot */}
        <span
          aria-hidden
          className={cn(
            "size-3 rounded-full flex-shrink-0",
            isRecording
              ? "bg-rose-500 animate-pulse shadow-rose-500/60 shadow-sm"
              : "bg-amber-400",
          )}
        />

        {/* Time */}
        <span
          className={cn(
            "font-mono text-4xl font-bold tabular-nums tracking-tight",
            isRecording ? "text-white"     : "text-slate-400",
          )}
        >
          {formattedDuration}
        </span>

        {/* Paused label */}
        {isPaused && (
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-400 ml-1">
            Paused
          </span>
        )}
      </div>

      {/* Near-limit warning */}
      {isNearLimit && (
        <div
          role="alert"
          className="flex items-center gap-1.5 text-xs text-amber-400 font-medium"
        >
          <AlertTriangle className="size-3.5 flex-shrink-0" />
          <span>Recording will stop at 90 minutes</span>
        </div>
      )}
    </div>
  );
}
