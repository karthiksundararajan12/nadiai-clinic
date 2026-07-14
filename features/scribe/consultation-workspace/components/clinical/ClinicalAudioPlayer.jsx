"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "../../../transcript-review/components/Timestamp.jsx";
import {
  buildMergedAudioUrl,
  fetchAudioPlaybackManifest,
} from "../../services/audio-playback.client.js";
import { cn } from "@/lib/utils";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

function Waveform({ progress, bars = 48, className }) {
  const heights = useMemo(
    () => Array.from({ length: bars }, (_, i) => 20 + Math.sin(i * 0.7) * 15 + (i % 5) * 4),
    [bars],
  );

  return (
    <div className={cn("flex h-10 items-end gap-0.5", className)}>
      {heights.map((h, i) => {
        const filled = i / bars <= progress;
        return (
          <div
            key={i}
            className={cn(
              "w-1 rounded-full transition-colors",
              filled ? "bg-primary" : "bg-slate-200",
            )}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

export function ClinicalAudioPlayer({ sessionId, onTimeUpdate, onSeekReady, className }) {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const manifest = await fetchAudioPlaybackManifest(sessionId);
        if (cancelled) return;
        const url = await buildMergedAudioUrl(manifest);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = url;
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.load();
        }
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Audio unavailable");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [sessionId]);

  const seekTo = useCallback((seconds, shouldPlay = false) => {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    audio.currentTime = Math.max(0, Math.min(seconds, duration || seconds));
    setCurrentTime(audio.currentTime);
    if (shouldPlay) {
      audio.play().catch(() => {});
    }
  }, [ready, duration]);

  useEffect(() => {
    onSeekReady?.(seekTo);
    return () => onSeekReady?.(null);
  }, [onSeekReady, seekTo]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
    } else {
      audio.pause();
    }
  }, []);

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 rounded-2xl border bg-white p-4 text-xs text-slate-500", className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading consultation audio…
      </div>
    );
  }

  if (error || !ready) return null;

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm", className)}>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrentTime(t);
          onTimeUpdate?.(t);
        }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        className="hidden"
      />

      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-slate-900">Consultation Audio</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-500">
          {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
        </span>
      </div>

      <Waveform progress={progress} className="mb-3 w-full" />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 rounded-full bg-primary hover:bg-primary/90"
          onClick={togglePlay}
        >
          {playing ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white" />}
        </Button>

        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={(e) => seekTo(Number(e.target.value))}
          className="h-1.5 min-w-[120px] flex-1 cursor-pointer accent-primary"
          aria-label="Seek playback"
        />

        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"
          aria-label="Playback speed"
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}x</option>
          ))}
        </select>
      </div>
    </div>
  );
}
