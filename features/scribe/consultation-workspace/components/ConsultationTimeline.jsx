"use client";

import { Check, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "recording", label: "Recording", statuses: ["RECORDING", "UPLOADING", "UPLOADED"] },
  { key: "transcribed", label: "Transcribed", statuses: ["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"] },
  { key: "soap", label: "SOAP Generated", statuses: ["GENERATING_SOAP", "SOAP_READY", "SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING"] },
  { key: "approved", label: "SOAP Approved", statuses: ["SOAP_APPROVED", "COMPLETED"] },
];

function stepState(stepIndex, activeIndex, isProcessing) {
  if (stepIndex < activeIndex) return "done";
  if (stepIndex === activeIndex) return isProcessing ? "active" : "done";
  return "pending";
}

function resolveActiveIndex(status) {
  if (["RECORDING", "UPLOADING", "UPLOADED"].includes(status)) return 0;
  if (["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"].includes(status)) return 1;
  if (["GENERATING_SOAP", "SOAP_READY", "SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING"].includes(status)) return 2;
  if (["SOAP_APPROVED", "COMPLETED", "READY_FOR_PRESCRIPTION"].includes(status)) return 3;
  if (status === "TRANSCRIBING" || status === "QUEUED") return 0;
  return 1;
}

export function ConsultationTimeline({ status, processing = false }) {
  const activeIndex = resolveActiveIndex(status ?? "");

  return (
    <nav
      aria-label="Consultation progress"
      className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-white px-4 py-2"
    >
      {STEPS.map((step, index) => {
        const state = stepState(index, activeIndex, processing && index === activeIndex);
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center gap-1">
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                state === "done" && "bg-emerald-50 text-emerald-700",
                state === "active" && "bg-indigo-50 text-indigo-700",
                state === "pending" && "bg-slate-50 text-slate-400",
              )}
            >
              {state === "done" && <Check className="h-3 w-3" />}
              {state === "active" && <Loader2 className="h-3 w-3 animate-spin" />}
              {state === "pending" && <Circle className="h-3 w-3" />}
              {step.label}
            </div>
            {!isLast && <span className="text-slate-300">→</span>}
          </div>
        );
      })}
    </nav>
  );
}
