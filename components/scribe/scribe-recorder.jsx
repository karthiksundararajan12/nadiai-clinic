"use client";

import { Mic, MicOff, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function ScribeRecorder({
  isRecording,
  isPaused,
  duration,
  onStart,
  onPause,
  onResume,
  onStop,
}) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative">
        <button
          onClick={isRecording ? onStop : onStart}
          className={cn(
            "relative flex h-24 w-24 items-center justify-center rounded-full transition-all duration-300",
            isRecording
              ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
              : "bg-primary/10 text-primary hover:bg-primary/20"
          )}
        >
          {isRecording ? (
            <Square className="h-8 w-8" />
          ) : (
            <Mic className="h-8 w-8" />
          )}
        </button>

        {isRecording && !isPaused && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-destructive" />
            </span>
          </>
        )}
      </div>

      {isRecording && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "h-2 w-2 rounded-full",
                isPaused ? "bg-warning" : "bg-destructive animate-pulse"
              )}
            />
            <span className="text-2xl font-mono font-semibold tabular-nums text-foreground">
              {formatDuration(duration)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={isPaused ? onResume : onPause}
              className="gap-1.5"
            >
              {isPaused ? (
                <>
                  <Play className="h-3.5 w-3.5" /> Resume
                </>
              ) : (
                <>
                  <Pause className="h-3.5 w-3.5" /> Pause
                </>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onStop}
              className="gap-1.5"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          </div>
        </div>
      )}

      {!isRecording && (
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">
            Tap to start recording
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Speak in Hindi, English, or Hinglish
          </p>
        </div>
      )}
    </div>
  );
}
