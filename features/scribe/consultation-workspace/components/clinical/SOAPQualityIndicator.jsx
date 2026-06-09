"use client";

import { cn } from "@/lib/utils";

const STYLES = {
  high: { dot: "bg-emerald-500", bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-800" },
  review: { dot: "bg-amber-500", bg: "bg-amber-50 border-amber-200", text: "text-amber-800" },
  low: { dot: "bg-rose-500", bg: "bg-rose-50 border-rose-200", text: "text-rose-800" },
};

export function SOAPQualityIndicator({ quality }) {
  if (!quality) return null;
  const style = STYLES[quality.level] ?? STYLES.review;

  return (
    <div className={cn("rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-none", style.bg)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">SOAP Quality</p>
      <div className="mt-1 flex items-center gap-2">
        <span className={cn("h-2.5 w-2.5 rounded-full", style.dot)} />
        <span className={cn("text-sm font-semibold", style.text)}>{quality.label}</span>
      </div>
      <p className="mt-1 text-xs text-slate-600">{quality.description}</p>
    </div>
  );
}
