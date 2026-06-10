"use client";

import { useEffect, useRef } from "react";
import { Loader2, Stethoscope, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../../transcript-review/components/Timestamp.jsx";

function isDoctor(segment) {
  const label = segment.speaker_label ?? segment.speaker ?? "";
  return label === "Doctor" || label === "A";
}

export function ScribeConversationChat({
  segments = [],
  loading,
  loadingMessage,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    if (segments.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments.length]);

  if (loading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-600" />
        <p className="text-xs text-gray-500">{loadingMessage ?? "Processing conversation…"}</p>
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-6 text-center">
        <p className="text-xs text-gray-400">
          Conversation will appear here after transcription.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" data-testid="transcript-review-workspace">
      <div className="space-y-3">
        {segments.map((segment) => {
          const doctor = isDoctor(segment);
          return (
            <div
              key={segment.id}
              id={`chat-segment-${segment.id}`}
              className={cn("flex gap-2", doctor ? "flex-row-reverse" : "flex-row")}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                  doctor ? "bg-cyan-100 text-cyan-700" : "bg-gray-100 text-gray-600",
                )}
              >
                {doctor ? <Stethoscope className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
              </div>
              <div className={cn("max-w-[82%] min-w-0", doctor && "text-right")}>
                <div className={cn("mb-0.5 flex items-center gap-1.5", doctor && "justify-end")}>
                  <span className="text-[10px] font-semibold text-gray-600">
                    {segment.speaker_label ?? (doctor ? "Doctor" : "Patient")}
                  </span>
                  <span className="font-mono text-[9px] text-gray-400">
                    {formatTimestamp(segment.start_seconds)}
                  </span>
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    doctor
                      ? "rounded-tr-sm bg-cyan-600 text-white"
                      : "rounded-tl-sm border border-gray-200 bg-white text-gray-800",
                  )}
                >
                  <p className="whitespace-pre-wrap">{segment.text}</p>
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
