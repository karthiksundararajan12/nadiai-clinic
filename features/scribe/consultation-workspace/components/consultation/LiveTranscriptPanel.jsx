"use client";

import { Loader2 } from "lucide-react";
import { ScribeConversationChat } from "./ScribeConversationChat.jsx";

function MicIndicator({ micState, liveStatus, fallback }) {
  const connecting = liveStatus === "connecting" || liveStatus === "reconnecting";

  if (micState === "requesting" || (connecting && micState !== "recording" && micState !== "paused")) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600" role="status">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        {micState === "requesting" ? "Requesting microphone…" : "Connecting live transcript…"}
      </span>
    );
  }

  if (micState === "recording") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700" role="status">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
        {connecting ? "Recording · connecting transcript…" : "Recording"}
      </span>
    );
  }

  if (micState === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800" role="status">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Paused
      </span>
    );
  }

  if (fallback) {
    return (
      <span className="text-xs font-medium text-amber-800" role="status">
        Live transcript unavailable
      </span>
    );
  }

  return (
    <span className="text-xs font-medium text-gray-500" role="status">
      Microphone stopped
    </span>
  );
}

/**
 * Passive Deepgram partials. Does not start, stop, or wait on SOAP generation.
 */
export function LiveTranscriptPanel({
  segments = [],
  liveStatus = "idle",
  fallback = false,
  micState = "inactive",
}) {
  const listening = micState === "recording" || micState === "paused" || micState === "requesting";

  return (
    <section
      className="flex max-h-[42%] min-h-[180px] shrink-0 flex-col border-b border-gray-200 bg-white"
      data-testid="live-transcript-panel"
      aria-label="Live transcript"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Live transcript</p>
        <MicIndicator micState={micState} liveStatus={liveStatus} fallback={fallback} />
      </div>
      <ScribeConversationChat
        segments={segments}
        isLiveRecording={listening}
        liveFallback={fallback}
        loading={false}
      />
    </section>
  );
}
