"use client";

/**
 * Live waveform visualiser — reactive bars + oscilloscope while recording.
 */

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

const BAR_COUNT = 32;

/**
 * @param {{
 *   level?: number;
 *   waveformData?: Uint8Array;
 *   isActive: boolean;
 *   isPaused?: boolean;
 *   className?: string;
 * }} props
 */
export function AudioLevelMeter({
  level = 0,
  waveformData,
  isActive,
  isPaused = false,
  className,
}) {
  const pathRef = useRef(null);
  const fillRef = useRef(null);
  const glowRef = useRef(null);
  const barsRef = useRef(null);
  const smoothRef = useRef(0);
  const gradientId = useId().replace(/:/g, "");
  const fillGradientId = `${gradientId}-fill`;

  useEffect(() => {
    const pathEl = pathRef.current;
    const fillEl = fillRef.current;
    const glowEl = glowRef.current;
    const barsEl = barsRef.current;
    if (!pathEl || !fillEl || !glowEl || !barsEl || !isActive) return;

    let rafId;
    const width = 280;
    const height = 56;
    const midY = height / 2;

    const draw = () => {
      const t = Date.now() / 1000;
      const target = isPaused
        ? smoothRef.current * 0.92
        : Math.max(0, Math.min(100, level)) / 100;
      smoothRef.current += (target - smoothRef.current) * (isPaused ? 0.08 : 0.22);

      const energy = smoothRef.current;
      const samples = waveformData?.length
        ? downsample(waveformData, BAR_COUNT)
        : syntheticWave(BAR_COUNT, energy, t);

      for (let i = 0; i < BAR_COUNT; i++) {
        const bar = barsEl.children[i];
        if (!bar) continue;
        const sample = samples[i] ?? 128;
        const normalised = Math.abs((sample - 128) / 128);
        const barHeight = isPaused
          ? 0.12 + energy * 0.2
          : 0.1 + normalised * 0.9 + energy * 0.3;
        bar.style.transform = `scaleY(${Math.min(1, barHeight).toFixed(3)})`;
        bar.style.opacity = isPaused ? "0.55" : String(0.75 + energy * 0.25);
      }

      const lineSamples = downsample(samples, 64);
      const amplitude = isPaused ? 5 + energy * 8 : 8 + energy * 26;
      const points = lineSamples.map((sample, i) => {
        const x = (i / (lineSamples.length - 1)) * width;
        const normalised = (sample - 128) / 128;
        const y = midY - normalised * amplitude;
        return [x, y];
      });

      const line = pointsToLine(points);
      const area = `${line} L ${width} ${height} L 0 ${height} Z`;

      pathEl.setAttribute("d", line);
      fillEl.setAttribute("d", area);
      glowEl.setAttribute("d", line);
      glowEl.style.opacity = isPaused ? "0.25" : String(0.55 + energy * 0.45);

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, isPaused, level, waveformData]);

  if (!isActive) return null;

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn("relative flex w-full flex-col items-center gap-2", className)}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-2xl transition-colors duration-300",
          isPaused ? "bg-amber-400/10" : "bg-cyan-400/15 shadow-[inset_0_0_24px_rgba(6,182,212,0.12)]",
        )}
      />

      <div
        ref={barsRef}
        className="relative z-10 flex h-14 w-full max-w-[280px] items-center justify-center gap-[3px] px-2"
      >
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-full w-[5px] origin-center rounded-full shadow-sm",
              isPaused
                ? "bg-gradient-to-t from-amber-600 via-amber-400 to-yellow-300"
                : "bg-gradient-to-t from-teal-600 via-cyan-400 to-emerald-300",
            )}
            style={{ transform: "scaleY(0.12)" }}
          />
        ))}
      </div>

      <svg
        viewBox="0 0 280 56"
        className="relative z-10 h-8 w-full max-w-[280px]"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.85" />
            <stop offset="35%" stopColor="#06b6d4" stopOpacity="1" />
            <stop offset="65%" stopColor="#22d3ee" stopOpacity="1" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id={fillGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          ref={glowRef}
          fill="none"
          stroke="#67e8f9"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "blur(5px)" }}
        />
        <path ref={fillRef} fill={`url(#${fillGradientId})`} stroke="none" />
        <path
          ref={pathRef}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <span
        className={cn(
          "absolute right-2 top-2 z-20 h-2.5 w-2.5 rounded-full shadow-sm",
          isPaused ? "bg-amber-400" : "bg-red-500 animate-pulse shadow-red-500/50",
        )}
      />
    </div>
  );
}

function downsample(data, targetCount) {
  const out = new Array(targetCount);
  const step = data.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const idx = Math.min(data.length - 1, Math.floor(i * step));
    out[i] = data[idx];
  }
  return out;
}

function syntheticWave(count, energy, t) {
  return Array.from({ length: count }, (_, i) => {
    const phase = (i / count) * Math.PI * 5 + t * 3.5;
    const wave = Math.sin(phase) * 0.4 + Math.sin(phase * 2.1 + t) * 0.18;
    return 128 + wave * energy * 100;
  });
}

function pointsToLine(points) {
  if (!points.length) return "";
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");
}
