"use client";

import { Loader2, Mic, Pause, Play, Plus, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioLevel } from "@/features/scribe/recording/use-audio-level.js";
import { AudioLevelMeter } from "@/features/scribe/components/recording/AudioLevelMeter.jsx";
import { ScribeConversationChat } from "./ScribeConversationChat.jsx";
import { Button } from "@/components/ui/button";

export function ScribeRecordPanel({
  recordState = "idle",
  durationLabel,
  statusMessage,
  disabled,
  analyserNode,
  pauseSupported = true,
  transcriptSegments = [],
  highlightedSegmentId = null,
  transcriptLoading,
  transcriptLoadingMessage,
  canStartNewSession,
  onStart,
  onPause,
  onResume,
  onStop,
  onNewSession,
  footer,
}) {
  const isIdle = recordState === "idle";
  const isRequesting = recordState === "requesting";
  const isRecording = recordState === "recording";
  const isPaused = recordState === "paused";
  const isProcessing = recordState === "processing";
  const isLive = isRecording || isPaused;

  const { level, waveformData } = useAudioLevel(analyserNode, isLive);

  const statusTitle = isProcessing
    ? "Processing…"
    : isRequesting
      ? "Requesting microphone…"
      : isPaused
        ? "Paused"
        : isRecording
          ? "Recording"
          : disabled
            ? "Session in progress"
            : "Ready to record";

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r border-gray-200 bg-gray-50 md:w-[40%]">
      <div className="flex shrink-0 flex-col items-center gap-4 border-b border-gray-200 px-4 py-5">
        {isLive && (
          <AudioLevelMeter
            level={level}
            waveformData={waveformData}
            isActive
            isPaused={isPaused}
            className="w-full"
          />
        )}

        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">{statusTitle}</p>
          {durationLabel && isLive && (
            <p className="mt-0.5 font-mono text-xs tabular-nums text-gray-500">{durationLabel}</p>
          )}
          {statusMessage && !transcriptLoading && (
            <p className="mt-1 text-xs text-gray-500">{statusMessage}</p>
          )}
        </div>

        <div className="flex w-full max-w-[240px] flex-col items-center gap-2">
          {(isIdle || isRequesting) && !disabled && (
            <button
              type="button"
              aria-label="Start recording"
              disabled={disabled || isProcessing || isRequesting}
              onClick={onStart}
              className={cn(
                "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3",
                "bg-cyan-600 text-sm font-semibold text-white shadow-md shadow-cyan-600/20",
                "transition-all duration-200 hover:bg-cyan-700",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {isRequesting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
              {isRequesting ? "Starting…" : "Start Recording"}
            </button>
          )}

          {isProcessing && (
            <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-5 py-3 text-sm text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Processing…
            </div>
          )}

          {disabled && !isLive && !isProcessing && (
            <div className="w-full rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-center text-xs text-gray-500">
              Finish or end the open consultation to record again
            </div>
          )}

          {isLive && (
            <div className="flex w-full gap-2">
              {pauseSupported && (
                <button
                  type="button"
                  aria-label={isPaused ? "Resume recording" : "Pause recording"}
                  onClick={isPaused ? onResume : onPause}
                  className={cn(
                    "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3",
                    "text-sm font-semibold text-white shadow-md transition-all duration-200",
                    isPaused
                      ? "bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700"
                      : "bg-amber-500 shadow-amber-500/20 hover:bg-amber-600",
                  )}
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4" />
                      Pause
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                aria-label="Stop recording"
                onClick={onStop}
                className={cn(
                  "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3",
                  "bg-red-600 text-sm font-semibold text-white shadow-md shadow-red-600/20",
                  "transition-all duration-200 hover:bg-red-700",
                  !pauseSupported && "w-full",
                )}
              >
                <Square className="h-4 w-4 fill-current" />
                Stop
              </button>
            </div>
          )}
        </div>

        {(isIdle || isRequesting) && !disabled && (
          <p className="max-w-[240px] text-center text-xs leading-relaxed text-gray-500">
            Speak clearly and louder. Minimum recording length is 10 seconds.
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation</p>
        </div>
        <ScribeConversationChat
          segments={transcriptSegments}
          highlightedSegmentId={highlightedSegmentId}
          loading={transcriptLoading}
          loadingMessage={transcriptLoadingMessage ?? statusMessage}
        />
      </div>

      <div className="shrink-0 space-y-3 border-t border-gray-200 px-4 py-4">
        {canStartNewSession && (
          <Button
            type="button"
            className="w-full cursor-pointer gap-2"
            onClick={onNewSession}
          >
            <Plus className="h-4 w-4" />
            New Session
          </Button>
        )}
        {footer}
      </div>
    </aside>
  );
}
