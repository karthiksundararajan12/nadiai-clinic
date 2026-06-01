"use client";

/**
 * AudioLevelMeter — animated bar visualiser driven by a 0–100 audio level value.
 *
 * Renders N bars whose heights animate with the current microphone level.
 * Uses CSS transitions so it stays performant even on low-end mobile devices.
 * Falls back gracefully if the analyser is unavailable.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ANALYSER_CONFIG } from "@/features/scribe/recording/constants.js";

const BAR_COUNT = ANALYSER_CONFIG.BAR_COUNT;

/**
 * @param {{
 *   level:      number;    0–100
 *   isActive:   boolean;
 *   className?: string;
 * }} props
 */
export function AudioLevelMeter({ level, isActive, className }) {
  const barsRef = useRef([]);

  // Drive bar heights with rAF for smooth, jank-free animation.
  // We write to DOM directly (no setState) to avoid React re-render on every frame.
  useEffect(() => {
    if (!isActive) {
      // Reset all bars to idle height
      barsRef.current.forEach((bar, i) => {
        if (bar) bar.style.height = `${getIdleHeight(i)}px`;
      });
      return;
    }

    let rafId;
    const animate = () => {
      const normalised = Math.max(0, Math.min(100, level));
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const peak = getBarPeak(i, normalised);
        bar.style.height = `${peak}px`;
      });
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [isActive, level]);

  return (
    <div
      role="presentation"
      aria-hidden="true"
      className={cn(
        "flex items-end justify-center gap-[3px] h-12",
        className,
      )}
    >
      {Array.from({ length: BAR_COUNT }, (_, i) => (
        <div
          key={i}
          ref={(el) => { barsRef.current[i] = el; }}
          style={{
            height:           `${getIdleHeight(i)}px`,
            width:            "3px",
            borderRadius:     "2px",
            backgroundColor:  isActive ? getBarColor(i, BAR_COUNT) : "#334155",
            transition:       "height 80ms ease-out, background-color 300ms ease",
            willChange:       "height",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// BAR CALCULATION HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Calculates the height of bar `i` given current `level` (0–100).
 * Centre bars respond more than edge bars — gives a natural waveform shape.
 *
 * @param {number} i
 * @param {number} level
 * @returns {number} height in px
 */
function getBarPeak(i, level) {
  const MIN_H  = 3;
  const MAX_H  = 44;

  // Distance from centre: 0.0 (edge) → 1.0 (centre)
  const centre    = (BAR_COUNT - 1) / 2;
  const distance  = 1 - Math.abs(i - centre) / centre;
  const envelope  = 0.3 + 0.7 * distance; // edge bars still move a little

  const raw = MIN_H + (level / 100) * (MAX_H - MIN_H) * envelope;

  // Add slight randomness so adjacent bars don't move in lockstep
  const jitter = (Math.random() - 0.5) * 4 * (level / 100);
  return Math.max(MIN_H, Math.min(MAX_H, raw + jitter));
}

/**
 * Idle "breathing" height for each bar.
 *
 * @param {number} i
 * @returns {number} height in px
 */
function getIdleHeight(i) {
  const centre = (BAR_COUNT - 1) / 2;
  const t      = Math.sin(((i - centre) / centre) * Math.PI * 0.5);
  return Math.round(3 + Math.abs(t) * 5);
}

/**
 * Gradient colour from teal (left) to emerald (centre) to teal (right).
 *
 * @param {number} i
 * @param {number} total
 * @returns {string}
 */
function getBarColor(i, total) {
  const mid     = (total - 1) / 2;
  const t       = Math.abs(i - mid) / mid; // 0 = centre, 1 = edge
  // Interpolate: centre = #10b981 (emerald-500), edge = #0d9488 (teal-600)
  const r = Math.round(16  + (13  - 16)  * t);
  const g = Math.round(185 + (148 - 185) * t);
  const b = Math.round(129 + (136 - 129) * t);
  return `rgb(${r},${g},${b})`;
}
