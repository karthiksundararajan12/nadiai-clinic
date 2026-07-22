"use client";

import { Activity, Clock, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

export function ConsultationSummaryCard({ summary, className }) {
  if (!summary?.chiefComplaint && !summary?.symptoms?.length) return null;

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Stethoscope className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-slate-900">Consultation Summary</h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {summary.chiefComplaint && (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Chief Complaint
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{summary.chiefComplaint}</p>
          </div>
        )}
        {summary.duration && (
          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <Clock className="h-3 w-3" />
              Duration
            </p>
            <p className="mt-1 text-sm font-medium text-slate-900">{summary.duration}</p>
          </div>
        )}
      </div>

      {summary.symptoms?.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Activity className="h-3 w-3" />
            Symptoms
          </p>
          <ul className="mt-2 space-y-1">
            {summary.symptoms.map((symptom) => (
              <li key={symptom} className="flex items-start gap-2 text-sm text-slate-800">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {symptom}
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.keyFindings?.length > 0 && (
        <div className="mt-3 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">Key findings: </span>
          {summary.keyFindings.join(" · ")}
        </div>
      )}
    </div>
  );
}
