"use client";

import { useEffect, useRef } from "react";
import { AudioLines, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../../transcript-review/components/Timestamp.jsx";

function isDoctor(segment) {
  const label = segment.speaker_label ?? segment.speaker ?? "";
  return label === "Doctor" || label === "A";
}

function speakerLabel(segment) {
  return isDoctor(segment) ? "Doctor" : "Patient";
}

export function ScribeConversationChat({
  segments = [],
  loading,
  loadingMessage,
  highlightedSegmentId = null,
  isLiveRecording = false,
  liveFallback = false,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (segments.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-white px-4 py-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-xs text-gray-500">{loadingMessage ?? "Processing conversation…"}</p>
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-white px-4 py-8 text-center">
        <div className="rounded-full bg-gray-100 p-3">
          <AudioLines className="h-6 w-6 text-gray-400" />
        </div>
        <p className="max-w-xs text-xs text-gray-500">
          {isLiveRecording
            ? liveFallback
              ? "Live transcript unavailable. The full transcript will be saved when you stop recording."
              : "Listening… draft words appear here as you speak."
            : "Conversation will appear here after transcription."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-white px-3 py-3" data-testid="transcript-review-workspace">
      <div className="space-y-2">
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
                "flex w-full rounded-lg transition-all duration-300",
                doctor ? "justify-end" : "justify-start",
                isHighlighted && "animate-evidence-pulse ring-2 ring-primary/30 ring-offset-2",
              )}
            >
              <div className={cn("max-w-[88%] min-w-0", doctor ? "items-end" : "items-start")}>
                <p
                  className={cn(
                    "mb-0.5 px-1 text-[10px] font-semibold text-gray-600",
                    doctor && "text-right",
                  )}
                >
                  {label}:
                </p>
                <div
                  className={cn(
                    "relative rounded-lg px-3 py-2 text-xs leading-relaxed shadow-sm",
                    doctor
                      ? "rounded-tr-none bg-primary/5 text-gray-900"
                      : "rounded-tl-none border border-gray-200 bg-white text-gray-900",
                    isInterim && "italic text-gray-500",
                  )}
                  data-testid={isInterim ? "live-interim-transcript" : undefined}
                >
                  <p className={cn("whitespace-pre-wrap", isInterim && "text-gray-500 italic")}>
                    {segment.text}
                  </p>
                  <span
                    className={cn(
                      "mt-1 block text-[9px] text-gray-500",
                      doctor ? "text-right" : "text-left",
                    )}
                  >
                    {isInterim ? "draft" : formatTimestamp(segment.start_seconds ?? segment.start)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
