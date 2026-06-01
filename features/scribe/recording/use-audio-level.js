"use client";

/**
 * @fileoverview useAudioLevel — reads the AnalyserNode from the recording
 * service on every animation frame and converts raw PCM data into a
 * 0–100 level value and a waveform buffer for visualisation.
 *
 * Usage:
 *   const { level, waveformData } = useAudioLevel(analyserNode, isRecording);
 */

import { useState, useEffect, useRef } from "react";

/**
 * @param {AnalyserNode|null} analyserNode
 * @param {boolean}           isActive    True while recording or paused.
 * @returns {{ level: number; waveformData: Uint8Array }}
 */
export function useAudioLevel(analyserNode, isActive) {
  const [level,        setLevel]        = useState(0);
  const [waveformData, setWaveformData] = useState(() => new Uint8Array(0));
  const rafRef      = useRef(null);
  const bufferRef   = useRef(null);

  useEffect(() => {
    // Stop the loop and reset when not active or no analyser
    if (!analyserNode || !isActive) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      queueMicrotask(() => setLevel(0));
      return;
    }

    const bufferLength = analyserNode.frequencyBinCount; // fftSize / 2
    if (!bufferRef.current || bufferRef.current.length !== bufferLength) {
      bufferRef.current = new Uint8Array(bufferLength);
    }
    const data = bufferRef.current;

    const tick = () => {
      analyserNode.getByteTimeDomainData(data);

      // Root Mean Square (RMS) amplitude — gives perceptual loudness
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        // PCM samples are centred at 128 in byte format
        const sample = (data[i] - 128) / 128;
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / bufferLength);

      // Map RMS [0, 1] → level [0, 100] with a sensitivity boost.
      // Voice typically sits 0.01–0.2 RMS; silence is < 0.005.
      const normalised = Math.min(100, Math.round(rms * 400));

      setLevel(normalised);
      setWaveformData(new Uint8Array(data)); // copy so consumers can compare identity

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [analyserNode, isActive]);

  return { level, waveformData };
}
