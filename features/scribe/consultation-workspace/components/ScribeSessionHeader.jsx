"use client";

import { Bell, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AudioLevelMeter } from "@/features/scribe/components/recording/AudioLevelMeter.jsx";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function initials(name) {
  return (name ?? "DR")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ScribeSessionHeader({
  isRecording,
  isPaused,
  duration = 0,
  audioLevel = 0,
  doctorName,
  doctorSpecialty,
  onEndSession,
  endSessionLabel = "End Session",
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 lg:px-5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
            N
          </div>
          <div className="hidden sm:block leading-tight">
            <p className="text-sm font-semibold">Nadi AI</p>
            <p className="text-[10px] text-muted-foreground">AI Scribe</p>
          </div>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2 sm:gap-3 ml-1 sm:ml-4 pl-3 sm:pl-4 border-l">
            <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white gap-1 text-[10px] h-5">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              {isPaused ? "Paused" : "Recording"}
            </Badge>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {formatDuration(duration)}
            </span>
            <AudioLevelMeter
              level={isPaused ? 0 : audioLevel}
              isActive={isRecording && !isPaused}
              className="hidden md:flex h-8"
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {onEndSession && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEndSession}
            className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5 hover:text-destructive h-8 text-xs"
          >
            <Square className="h-3 w-3 fill-current" />
            <span className="hidden sm:inline">{endSessionLabel}</span>
          </Button>
        )}

        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
        </Button>

        <div className="flex items-center gap-2 pl-2 border-l">
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold",
            )}
          >
            {initials(doctorName)}
          </div>
          <div className="hidden md:block leading-tight">
            <p className="text-xs font-semibold truncate max-w-[140px]">{doctorName ?? "Doctor"}</p>
            <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
              {doctorSpecialty ?? "Physician"}
            </p>
          </div>
        </div>
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
    <footer className="flex h-9 shrink-0 items-center justify-between border-t bg-muted/30 px-4 text-[10px] text-muted-foreground lg:px-5">
      <span className="font-mono truncate max-w-[40%]">
        {sessionId ? `Session ${sessionId.slice(0, 8)}…` : "New session"}
      </span>
      <div className="flex items-center gap-2">
        {lastSaved && <span>Last saved {lastSaved}</span>}
        <Badge variant="outline" className="h-4 text-[9px] px-1.5 bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
          {statusLabel}
        </Badge>
      </div>
      <span>v{version} · Nadi AI</span>
    </footer>
  );
}
