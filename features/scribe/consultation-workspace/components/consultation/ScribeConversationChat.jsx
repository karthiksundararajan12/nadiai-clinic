"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../../transcript-review/components/Timestamp.jsx";

const WAVE_BARS = [10, 18, 28, 14, 36, 22, 12, 32, 20, 16, 30, 12, 24, 18, 10, 26];

function isDoctor(segment) {
  const label = segment.speaker_label ?? segment.speaker ?? "";
  return label === "Doctor" || label === "A";
}

function speakerLabel(segment) {
  return isDoctor(segment) ? "Doctor" : "Patient";
}

function WaveformBars({ animated = false, live = false }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 rounded-lg px-4",
        live ? "h-16 bg-[#EEF0FF] dark:bg-primary/15" : "h-12 bg-muted",
      )}
      aria-hidden
    >
      {WAVE_BARS.map((height, index) => (
        <span
          key={index}
          className={cn(
            "w-1 rounded-full",
            live ? "origin-center bg-primary" : "bg-gray-400 dark:bg-gray-500",
            animated && "origin-center animate-[scribe-wave_1.15s_ease-in-out_infinite]",
          )}
          style={{
            height: `${live ? height : Math.max(8, Math.round(height * 0.45))}px`,
            animationDelay: `${index * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ConversationHeading({ isLiveRecording, hasPatient }) {
  const title = isLiveRecording
    ? "Live Audio Waveform"
    : hasPatient
      ? "Conversation & Live Audio"
      : "Conversation & Audio Waveform";
  const standby = hasPatient ? "Standby (00:00)" : "Collapsed (Inactive)";

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-2 text-sm font-semibold text-heading">
        {isLiveRecording && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" aria-hidden />
        )}
        {title}
      </p>
      {!isLiveRecording && (
        <p className="text-xs text-gray-700 dark:text-gray-300">{standby}</p>
      )}
    </div>
  );
}

export function ScribeConversationChat({
  segments = [],
  loading,
  loadingMessage,
  highlightedSegmentId = null,
  isLiveRecording = false,
  animateWaveform = false,
  hasPatient = false,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (segments.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments]);

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-card px-4 py-4 text-left">
        <ConversationHeading isLiveRecording={false} hasPatient={hasPatient} />
        <WaveformBars />
        <div className="flex items-center justify-center gap-2 py-4 text-center">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-xs text-gray-700 dark:text-gray-300">{loadingMessage ?? "Processing conversation…"}</p>
        </div>
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 bg-card px-4 py-4"
        data-testid="conversation-placeholder"
      >
        <ConversationHeading isLiveRecording={isLiveRecording} hasPatient={hasPatient} />
        <WaveformBars animated={animateWaveform} live={isLiveRecording} />
        {isLiveRecording ? (
          <p className="text-xs text-gray-700 dark:text-gray-300">
            Transcript will appear here once you stop recording.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-card" data-testid="transcript-review-workspace">
      <div className="shrink-0 border-b border-border px-4 py-3">
        <ConversationHeading isLiveRecording={false} hasPatient={hasPatient} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          {segments.map((segment) => {
            const doctor = isDoctor(segment);
            const label = speakerLabel(segment);
            const isHighlighted = highlightedSegmentId === segment.id;
            const isInterim = Boolean(segment.is_interim);
            return (
              <div
                key={segment.id}
                id={`chat-segment-${segment.id}`}
                className={cn(
                  "rounded-lg border border-border bg-card px-3 py-2 shadow-clinical transition-all duration-300",
                  isHighlighted && "animate-evidence-pulse ring-2 ring-primary/30 ring-offset-2",
                )}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      doctor ? "text-primary" : "text-gray-600 dark:text-gray-300",
                    )}
                  >
                    {label}
                  </p>
                  <span className="font-mono text-xs tabular-nums text-gray-600 dark:text-gray-300">
                    {isInterim ? "draft" : formatTimestamp(segment.start_seconds ?? segment.start)}
                  </span>
                </div>
                <div
                  className={cn("text-xs leading-relaxed text-foreground", isInterim && "italic text-gray-600 dark:text-gray-300")}
                  data-testid={isInterim ? "live-interim-transcript" : undefined}
                >
                  <p className={cn("whitespace-pre-wrap", isInterim && "italic text-gray-600 dark:text-gray-300")}>
                    {segment.text}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
