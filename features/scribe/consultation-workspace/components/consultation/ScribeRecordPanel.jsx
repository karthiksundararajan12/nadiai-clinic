"use client";

import { Loader2, Mic, MicOff, Plus } from "lucide-react";
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
  transcriptSegments = [],
  transcriptLoading,
  transcriptLoadingMessage,
  canStartNewSession,
  onStart,
  onStop,
  onNewSession,
  footer,
}) {
  const isRecording = recordState === "recording";
  const isProcessing = recordState === "processing";

  const { level } = useAudioLevel(analyserNode, isRecording);

  const handleClick = () => {
    if (disabled || isProcessing) return;
    if (isRecording) onStop?.();
    else onStart?.();
  };

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r border-gray-200 bg-gray-50 md:w-[40%]">
      <div className="flex shrink-0 flex-col items-center gap-3 border-b border-gray-200 px-4 py-5">
        <button
          type="button"
          aria-label={isRecording ? "Stop recording" : "Start recording"}
          disabled={disabled || isProcessing}
          onClick={handleClick}
          className={cn(
            "relative flex h-24 w-24 cursor-pointer items-center justify-center rounded-full transition-all duration-200",
            "disabled:cursor-not-allowed disabled:opacity-60",
            isRecording
              ? "bg-red-600 text-white shadow-lg shadow-red-200 hover:bg-red-700"
              : isProcessing
                ? "bg-gray-200 text-gray-400"
                : "border-2 border-cyan-600 bg-white text-cyan-600 hover:border-cyan-700 hover:bg-cyan-50",
          )}
        >
          {isProcessing ? (
            <Loader2 className="h-9 w-9 animate-spin" />
          ) : isRecording ? (
            <MicOff className="h-9 w-9" />
          ) : (
            <Mic className="h-9 w-9" />
          )}
        </button>

        {isRecording && (
          <AudioLevelMeter level={level} isActive className="h-10" />
        )}

        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">
            {isProcessing
              ? "Processing…"
              : isRecording
                ? "Recording"
                : disabled
                  ? "Session in progress"
                  : "Tap to record"}
          </p>
          {durationLabel && isRecording && (
            <p className="mt-0.5 text-xs text-gray-500">{durationLabel}</p>
          )}
          {statusMessage && !transcriptLoading && (
            <p className="mt-1 text-xs text-gray-500">{statusMessage}</p>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation</p>
        </div>
        <ScribeConversationChat
          segments={transcriptSegments}
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
