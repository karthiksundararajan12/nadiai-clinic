"use client";

import { Mic, Pause, Play, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * Seven-bar waveform visualiser.
 * Active  → bars animate with staggered wave motion.
 * Paused  → bars freeze at low height in muted colour.
 * Idle    → not rendered.
 */
function WaveformBars({ active }) {
  // Stagger delays produce a smooth travelling-wave effect
  const delays = [0, 100, 200, 300, 200, 100, 0];
  return (
    <div className="flex items-center justify-center gap-[5px]" style={{ height: 48 }}>
      {delays.map((delay, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 48,
            borderRadius: 99,
            transformOrigin: "center",
            backgroundColor: active
              ? "var(--primary)"
              : "color-mix(in srgb, var(--muted-foreground) 25%, transparent)",
            transform: active ? undefined : "scaleY(0.12)",
            animation: active
              ? `scribe-wave 0.9s ease-in-out infinite ${delay}ms`
              : undefined,
            transition: "transform 0.4s ease, background-color 0.4s ease",
          }}
        />
      ))}
    </div>
  );
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
    <div className="flex flex-col items-center gap-6 py-2 w-full">
      {/* ── Mic button ──────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center">
        {/* Pulse rings — only when actively recording */}
        {isRecording && !isPaused && (
          <>
            <span className="absolute h-32 w-32 animate-ping rounded-full bg-primary/10 duration-1000" />
            <span className="absolute h-28 w-28 animate-ping rounded-full bg-primary/10 duration-700" style={{ animationDelay: "300ms" }} />
          </>
        )}

        <button
          onClick={isRecording ? undefined : onStart}
          aria-label={isRecording ? "Recording in progress" : "Start recording"}
          disabled={isRecording}
          className={cn(
            "relative z-10 flex h-24 w-24 items-center justify-center rounded-full transition-all duration-300 shadow-lg",
            isRecording && !isPaused
              ? "bg-primary text-primary-foreground cursor-default shadow-primary/30"
              : isRecording && isPaused
              ? "bg-muted text-muted-foreground cursor-default"
              : "bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105 cursor-pointer"
          )}
        >
          <Mic className={cn("h-9 w-9 transition-transform duration-300", isRecording && !isPaused && "scale-110")} />
        </button>

        {/* Recording dot indicator */}
        {isRecording && (
          <span className="absolute -top-1 -right-1 z-20 flex h-4 w-4">
            <span className={cn(
              "absolute inline-flex h-full w-full rounded-full",
              isPaused ? "bg-amber-400" : "animate-ping bg-destructive/60"
            )} />
            <span className={cn(
              "relative inline-flex h-4 w-4 rounded-full",
              isPaused ? "bg-amber-400" : "bg-destructive"
            )} />
          </span>
        )}
      </div>

      {/* ── Waveform + controls (recording state) ───────────────────── */}
      {isRecording ? (
        <div className="flex flex-col items-center gap-4 w-full">
          {/* Waveform */}
          <WaveformBars active={!isPaused} />

          {/* Timer */}
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-2xl font-mono font-semibold tabular-nums",
              isPaused ? "text-muted-foreground" : "text-foreground"
            )}>
              {formatDuration(duration)}
            </span>
            {isPaused && (
              <span className="text-xs font-medium text-amber-500 uppercase tracking-widest">Paused</span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={isPaused ? onResume : onPause}
              className="gap-1.5 min-w-24"
            >
              {isPaused ? (
                <><Play className="h-3.5 w-3.5" /> Resume</>
              ) : (
                <><Pause className="h-3.5 w-3.5" /> Pause</>
              )}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onStop}
              className="gap-1.5 min-w-24"
            >
              <Square className="h-3.5 w-3.5" /> Stop
            </Button>
          </div>
        </div>
      ) : (
        /* ── Idle state hint ────────────────────────────────────────── */
        <div className="text-center space-y-1">
          <p className="text-sm font-medium text-foreground">Tap to start recording</p>
          <p className="text-xs text-muted-foreground">Speak naturally — transcription runs in the background</p>
        </div>
      )}
    </div>
  );
}
