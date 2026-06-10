"use client";

import { Loader2, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function ScribeRecordPanel({
  recordState = "idle",
  durationLabel,
  statusMessage,
  disabled,
  onStart,
  onStop,
  footer,
}) {
  const isRecording = recordState === "recording";
  const isProcessing = recordState === "processing";

  const handleClick = () => {
    if (disabled || isProcessing) return;
    if (isRecording) onStop?.();
    else onStart?.();
  };

  return (
    <aside className="flex h-full min-w-0 flex-1 basis-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-8">
        <button
          type="button"
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          disabled={disabled || isProcessing}
          onClick={handleClick}
          className={cn(
            "relative flex h-28 w-28 cursor-pointer items-center justify-center rounded-full transition-all duration-200",
            "disabled:cursor-not-allowed disabled:opacity-60",
            isRecording
              ? "bg-red-600 text-white shadow-lg shadow-red-200 animate-pulse hover:bg-red-700"
              : isProcessing
                ? "bg-gray-200 text-gray-400"
                : "border-2 border-cyan-600 bg-white text-cyan-600 hover:border-cyan-700 hover:bg-cyan-50",
          )}
        >
          {isProcessing ? (
            <Loader2 className="h-10 w-10 animate-spin" />
          ) : isRecording ? (
            <>
              <span className="absolute inset-0 rounded-full ring-2 ring-red-400 ring-offset-2" />
              <MicOff className="relative h-10 w-10" />
            </>
          ) : (
            <Mic className="h-10 w-10" />
          )}
        </button>

        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">
            {isProcessing
              ? "Processing…"
              : isRecording
                ? "Recording"
                : "Tap to record"}
          </p>
          {durationLabel && isRecording && (
            <p className="mt-1 text-xs text-gray-500">{durationLabel}</p>
          )}
          {statusMessage && (
            <p className="mt-2 text-xs text-gray-500">{statusMessage}</p>
          )}
        </div>
      </div>

      {footer && (
        <div className="shrink-0 border-t border-gray-200 px-4 py-4">
          {footer}
        </div>
      )}
    </aside>
  );
}
