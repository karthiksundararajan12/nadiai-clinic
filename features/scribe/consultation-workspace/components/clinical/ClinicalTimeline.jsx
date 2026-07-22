"use client";

import { AlertTriangle, Check, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "recording", label: "Recording Complete", from: ["UPLOADED", "TRANSCRIPTION_QUEUED", "TRANSCRIBING", "TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED", "GENERATING_SOAP", "SOAP_READY", "SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING", "SOAP_APPROVED", "COMPLETED"] },
  { key: "transcript", label: "Transcript Generated", from: ["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED", "GENERATING_SOAP", "SOAP_READY", "SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING", "SOAP_APPROVED", "COMPLETED"] },
  { key: "soap", label: "SOAP Generated", from: ["SOAP_READY", "SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING", "SOAP_APPROVED", "COMPLETED"] },
  { key: "review", label: "SOAP Review Required", actionFrom: ["SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING"], doneFrom: ["SOAP_APPROVED", "COMPLETED"] },
  { key: "rx", label: "Prescription Pending", from: ["READY_FOR_PRESCRIPTION", "PRESCRIPTION_DRAFT_READY", "PRESCRIPTION_APPROVED", "COMPLETED"] },
];

function stepState(step, status) {
  if (step.doneFrom?.includes(status)) return "complete";
  if (step.actionFrom?.includes(status)) return "action";
  if (step.from?.includes(status)) return "complete";
  return "pending";
}

export function ClinicalTimeline({ status, className }) {
  return (
    <nav
      aria-label="Consultation progress"
      className={cn(
        "flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-gray-200 bg-white px-5 py-3 lg:px-6",
        className,
      )}
    >
      {STEPS.map((step, index) => {
        const state = stepState(step, status ?? "");
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.key} className="flex items-center gap-1">
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                state === "complete" && "bg-emerald-50 text-emerald-700",
                state === "action" && "bg-amber-50 text-amber-800",
                state === "pending" && "bg-white text-slate-400 ring-1 ring-slate-200",
              )}
            >
              {state === "complete" && <Check className="h-3 w-3" />}
              {state === "action" && <AlertTriangle className="h-3 w-3" />}
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
