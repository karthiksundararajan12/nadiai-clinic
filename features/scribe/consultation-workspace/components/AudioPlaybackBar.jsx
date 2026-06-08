"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatTimestamp } from "../../transcript-review/components/Timestamp.jsx";
import {
  buildMergedAudioUrl,
  fetchAudioPlaybackManifest,
} from "../services/audio-playback.client.js";

export function AudioPlaybackBar({ sessionId, onTimeUpdate, onSeekReady }) {
  const audioRef = useRef(null);
  const objectUrlRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!sessionId) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setReady(false);
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

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      await audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, []);

  const seekTo = useCallback((seconds) => {
    const audio = audioRef.current;
    if (!audio || !ready) return;
    audio.currentTime = Math.max(0, seconds);
    setCurrentTime(audio.currentTime);
  }, [ready]);

  useEffect(() => {
    onSeekReady?.(seekTo);
    return () => onSeekReady?.(null);
  }, [onSeekReady, seekTo]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading audio…
      </div>
    );
  }

  if (error || !ready) return null;

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-2">
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
      <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={togglePlay}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <span className="font-mono text-xs tabular-nums text-slate-600">
        {formatTimestamp(currentTime)} / {formatTimestamp(duration || currentTime)}
      </span>
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={currentTime}
        onChange={(e) => seekTo(Number(e.target.value))}
        className="h-1.5 min-w-0 flex-1 cursor-pointer accent-slate-800"
        aria-label="Seek audio playback"
      />
    </div>
  );
}
