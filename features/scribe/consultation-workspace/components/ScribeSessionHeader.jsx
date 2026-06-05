"use client";

import { Bell, History, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AudioLevelMeter } from "@/features/scribe/components/recording/AudioLevelMeter.jsx";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function ScribeSessionHeader({
  isRecording,
  isPaused,
  duration = 0,
  audioLevel = 0,
  onEndSession,
  onOpenSessions,
  endSessionLabel = "End Session",
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200/80 bg-white px-4 lg:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {isRecording ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {isPaused ? "Paused" : "Recording"}
            </span>
            <span className="font-mono text-[14px] font-semibold tabular-nums text-slate-900">
              {formatDuration(duration)}
            </span>
            <AudioLevelMeter
              level={isPaused ? 0 : audioLevel}
              isActive={isRecording && !isPaused}
              className="hidden h-7 md:flex"
            />
          </>
        ) : (
          <span className="text-[13px] font-medium text-slate-500">Clinical workspace</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {onOpenSessions && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSessions}
            className="h-8 gap-1.5 text-xs text-slate-600 hover:text-slate-900"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sessions</span>
          </Button>
        )}

        {onEndSession && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEndSession}
            className="h-8 gap-1.5 border-rose-200 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
          >
            <Square className="h-3 w-3 fill-current" />
            <span className="hidden sm:inline">{endSessionLabel}</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 text-slate-500 hover:text-slate-700"
        >
          <Bell className="h-[17px] w-[17px]" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-rose-500" />
        </Button>
      </div>
    </header>
  );
}

export function ScribeSessionFooter({
  sessionId,
  lastSaved,
  statusLabel = "Draft",
  version = "1.0",
}) {
  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-slate-200/80 bg-white px-4 text-[11px] text-slate-500 lg:px-5">
      <span className="max-w-[35%] truncate font-mono">
        {sessionId ? `Session ${sessionId.slice(0, 8)}…` : "New session"}
      </span>
      <div className="flex items-center gap-2.5">
        {lastSaved && <span>Last saved {lastSaved}</span>}
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-600/15">
          {statusLabel}
        </span>
      </div>
      <span className="hidden sm:inline">v{version}</span>
    </footer>
  );
}
