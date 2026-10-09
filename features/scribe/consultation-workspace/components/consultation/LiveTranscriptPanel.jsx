"use client";

import { Loader2 } from "lucide-react";

function MicIndicator({ micState, liveStatus, fallback }) {
  const connecting = liveStatus === "connecting" || liveStatus === "reconnecting";

  if (micState === "requesting" || (connecting && micState !== "recording" && micState !== "paused")) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700" role="status">
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
    <span className="text-xs font-medium text-gray-700" role="status">
      Microphone stopped
    </span>
  );
}

/**
 * Recorder status strip. Live Deepgram partials are intentionally not rendered;
 * the conversation is shown in the record panel only after recording stops.
 */
export function LiveTranscriptPanel({
  liveStatus = "idle",
  fallback = false,
  micState = "inactive",
}) {
  return (
    <section
      className="flex shrink-0 flex-col bg-card"
      data-testid="live-transcript-panel"
      aria-label="Recorder status"
    >
      <div className="flex shrink-0 items-center justify-end gap-3 px-4 pt-3">
        <MicIndicator micState={micState} liveStatus={liveStatus} fallback={fallback} />
      </div>
    </section>
  );
}
