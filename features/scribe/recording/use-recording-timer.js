"use client";

/**
 * @fileoverview useRecordingTimer — elapsed time counter that accumulates
 * correctly across pause/resume cycles.
 *
 * Usage:
 *   const { duration, formattedDuration } = useRecordingTimer(isRecording, isPaused);
 */

import { useState, useEffect, useRef } from "react";

/**
 * @param {boolean} isActive  True while a recording session is live (including paused).
 * @param {boolean} isPaused  True while the session is paused.
 * @returns {{ duration: number; formattedDuration: string }}
 */
export function useRecordingTimer(isActive, isPaused) {
  const [duration, setDuration]    = useState(0);
  const intervalRef                = useRef(null);
  const accumulatedRef             = useRef(0);

  useEffect(() => {
    // Reset completely when session ends
    if (!isActive) {
      clearInterval(intervalRef.current);
      intervalRef.current  = null;
      accumulatedRef.current = 0;
      queueMicrotask(() => setDuration(0));
      return;
    }

    // Pause: freeze the counter
    if (isPaused) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    // Active and not paused: increment every second
    if (!intervalRef.current) {
      intervalRef.current = setInterval(() => {
        accumulatedRef.current += 1;
        setDuration(accumulatedRef.current);
      }, 1_000);
    }

    return () => {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
  }, [isActive, isPaused]);

  return { duration, formattedDuration: formatDuration(duration) };
}

/**
 * Formats seconds into MM:SS or HH:MM:SS.
 *
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");

  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
