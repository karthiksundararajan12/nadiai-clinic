"use client";

import { CircleNotch } from "@phosphor-icons/react";

function MicIndicator({ micState, liveStatus, fallback }) {
  const connecting = liveStatus === "connecting" || liveStatus === "reconnecting";

  if (micState === "requesting" || (connecting && micState !== "recording" && micState !== "paused")) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold scribe-text-muted" role="status">
        <CircleNotch size={16} weight="bold" className="animate-spin scribe-icon" />
        {micState === "requesting" ? "Requesting microphone…" : "Connecting live transcript…"}
      </span>
    );
  }

  if (micState === "recording") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700" role="status">
        <span className="h-2 w-2 animate-pulse rounded-full bg-red-600" />
        {connecting ? "Recording · connecting transcript…" : "Recording"}
      </span>
    );
  }

  if (micState === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800" role="status">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Paused
      </span>
    );
  }

  if (fallback) {
    return (
      <span className="text-sm font-semibold text-amber-800" role="status">
        Live transcript unavailable
      </span>
    );
  }

  return (
    <span className="scribe-text-muted text-sm font-semibold" role="status">
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
      className="flex shrink-0 flex-col bg-[color:var(--scribe-card-bg)]"
      data-testid="live-transcript-panel"
      aria-label="Recorder status"
    >
      <div className="flex shrink-0 items-center justify-end gap-3 px-4 pt-3">
        <MicIndicator micState={micState} liveStatus={liveStatus} fallback={fallback} />
      </div>
    </section>
  );
}
