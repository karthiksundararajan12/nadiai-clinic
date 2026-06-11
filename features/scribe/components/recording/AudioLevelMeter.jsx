"use client";

/**
 * Live waveform visualiser — animated bars when idle, reactive bars + oscilloscope when active.
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
    if (!pathEl || !fillEl || !glowEl || !barsEl) return;

    let rafId;
    const width = 280;
    const height = 56;
    const midY = height / 2;

    const draw = () => {
      const t = Date.now() / 1000;

      if (!isActive) {
        smoothRef.current *= 0.9;
        for (let i = 0; i < BAR_COUNT; i++) {
          const bar = barsEl.children[i];
          if (!bar) continue;
          const phase = (i / BAR_COUNT) * Math.PI * 2 + t * 2.2;
          const idle = 0.12 + (Math.sin(phase) * 0.5 + 0.5) * 0.18;
          bar.style.transform = `scaleY(${idle.toFixed(3)})`;
          bar.style.opacity = "0.35";
        }
        const flat = buildFlatPath(width, height);
        pathEl.setAttribute("d", flat.line);
        fillEl.setAttribute("d", flat.area);
        glowEl.setAttribute("d", flat.line);
        glowEl.style.opacity = "0";
        rafId = requestAnimationFrame(draw);
        return;
      }

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
          ? 0.1 + energy * 0.15
          : 0.08 + normalised * 0.85 + energy * 0.25;
        bar.style.transform = `scaleY(${Math.min(1, barHeight).toFixed(3)})`;
        bar.style.opacity = isPaused ? "0.4" : String(0.55 + energy * 0.45);
      }

      const lineSamples = downsample(samples, 64);
      const amplitude = isPaused ? 4 + energy * 6 : 6 + energy * 22;
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
      glowEl.style.opacity = isPaused ? "0.12" : String(0.3 + energy * 0.5);

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, isPaused, level, waveformData]);

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn("relative flex w-full flex-col items-center gap-2", className)}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-2xl transition-colors duration-500",
          isActive && !isPaused && "bg-cyan-500/[0.06]",
          isPaused && "bg-amber-500/[0.06]",
          !isActive && "bg-gray-100/80",
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
              "h-full w-[5px] origin-center rounded-full transition-colors duration-300",
              isActive && !isPaused && "bg-gradient-to-t from-cyan-600 to-cyan-400",
              isPaused && "bg-gradient-to-t from-amber-500 to-amber-300",
              !isActive && "bg-gradient-to-t from-cyan-700/40 to-cyan-500/30",
            )}
            style={{ transform: "scaleY(0.12)" }}
          />
        ))}
      </div>

      <svg
        viewBox="0 0 280 56"
        className="relative z-10 h-8 w-full max-w-[280px] opacity-80"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0891b2" stopOpacity="0.4" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="1" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.4" />
          </linearGradient>
          <linearGradient id={fillGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          ref={glowRef}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "blur(4px)" }}
        />
        <path ref={fillRef} fill={`url(#${fillGradientId})`} stroke="none" />
        <path
          ref={pathRef}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {isActive && (
        <span
          className={cn(
            "absolute right-2 top-2 z-20 h-2 w-2 rounded-full",
            isPaused ? "bg-amber-400" : "bg-red-500 animate-pulse",
          )}
        />
      )}
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

function buildFlatPath(width, height) {
  const y = height / 2;
  const line = `M 0 ${y} L ${width} ${y}`;
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  return { line, area };
}
