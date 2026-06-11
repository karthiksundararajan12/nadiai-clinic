"use client";

/**
 * Professional oscilloscope-style waveform visualiser for live mic input.
 */

import { useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

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
  const smoothRef = useRef(0);
  const gradientId = useId().replace(/:/g, "");
  const fillGradientId = `${gradientId}-fill`;

  useEffect(() => {
    const pathEl = pathRef.current;
    const fillEl = fillRef.current;
    const glowEl = glowRef.current;
    if (!pathEl || !fillEl || !glowEl) return;

    if (!isActive) {
      smoothRef.current = 0;
      const flat = buildFlatPath(120, 40);
      pathEl.setAttribute("d", flat.line);
      fillEl.setAttribute("d", flat.area);
      glowEl.setAttribute("d", flat.line);
      glowEl.style.opacity = "0";
      return;
    }

    let rafId;
    const width = 120;
    const height = 40;
    const midY = height / 2;

    const draw = () => {
      const target = isPaused ? smoothRef.current * 0.92 : Math.max(0, Math.min(100, level)) / 100;
      smoothRef.current += (target - smoothRef.current) * (isPaused ? 0.08 : 0.22);

      const amplitude = isPaused
        ? 2 + smoothRef.current * 4
        : 3 + smoothRef.current * 17;

      const samples = waveformData?.length
        ? downsample(waveformData, 48)
        : syntheticWave(48, smoothRef.current);

      const points = samples.map((sample, i) => {
        const x = (i / (samples.length - 1)) * width;
        const normalised = (sample - 128) / 128;
        const y = midY - normalised * amplitude;
        return [x, y];
      });

      const line = pointsToLine(points);
      const area = `${line} L ${width} ${height} L 0 ${height} Z`;

      pathEl.setAttribute("d", line);
      fillEl.setAttribute("d", area);
      glowEl.setAttribute("d", line);
      glowEl.style.opacity = isPaused ? "0.15" : String(0.35 + smoothRef.current * 0.45);

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, isPaused, level, waveformData]);

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        "relative flex w-full max-w-[200px] items-center justify-center",
        className,
      )}
    >
      <div
        className={cn(
          "absolute inset-0 rounded-xl transition-opacity duration-300",
          isActive && !isPaused && "bg-cyan-500/5",
          isPaused && "bg-amber-500/5",
        )}
      />
      <svg
        viewBox="0 0 120 40"
        className="h-10 w-full"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0891b2" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="1" />
            <stop offset="100%" stopColor="#0891b2" stopOpacity="0.55" />
          </linearGradient>
          <linearGradient id={fillGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          ref={glowRef}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: "blur(3px)" }}
        />
        <path
          ref={fillRef}
          fill={`url(#${fillGradientId})`}
          stroke="none"
        />
        <path
          ref={pathRef}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {isActive && (
        <span
          className={cn(
            "absolute -top-1 right-0 h-2 w-2 rounded-full",
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

function syntheticWave(count, energy) {
  const t = Date.now() / 240;
  return Array.from({ length: count }, (_, i) => {
    const phase = (i / count) * Math.PI * 4 + t;
    const wave = Math.sin(phase) * 0.35 + Math.sin(phase * 2.3) * 0.15;
    return 128 + wave * energy * 90;
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
