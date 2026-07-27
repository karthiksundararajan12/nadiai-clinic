"use client";

import { cn } from "@/lib/utils";

const STYLES = {
  high: { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800", desc: "text-emerald-700/80" },
  review: { dot: "bg-amber-500", bg: "bg-amber-50 border-amber-200", text: "text-amber-800", desc: "text-amber-700/80" },
  low: { dot: "bg-rose-500", bg: "bg-rose-50 border-rose-200", text: "text-rose-800", desc: "text-rose-700/80" },
};

export function SOAPQualityIndicator({ quality }) {
  if (!quality) return null;
  const style = STYLES[quality.level] ?? STYLES.review;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg border px-3.5 py-2.5",
        style.bg,
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", style.dot)} aria-hidden />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">SOAP Quality</span>
      <span className={cn("text-sm font-semibold", style.text)}>{quality.label}</span>
      <span className={cn("text-xs", style.desc)}>{quality.description}</span>
    </div>
  );
}
