"use client";

import { Clock, FileText, Sparkles, Timer } from "lucide-react";
import { cn } from "@/lib/utils";

function Metric({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

export function ProductivityInsightsCard({ metrics, className }) {
  if (!metrics) return null;

  return (
    <aside
      className={cn(
        "rounded-lg border border-gray-200 bg-white p-4 shadow-none",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-slate-900">Productivity Insights</h3>
      </div>

      <div className="space-y-2">
        <Metric icon={Timer} label="Documentation Time Saved" value={metrics.documentationTimeSaved} />
        <Metric icon={Clock} label="Recording Length" value={metrics.recordingLength} />
        <Metric icon={FileText} label="SOAP Generation" value={metrics.soapGenerationTime} />
        <Metric icon={Clock} label="Consultation Started" value={metrics.consultationDate} />
      </div>
    </aside>
  );
}
