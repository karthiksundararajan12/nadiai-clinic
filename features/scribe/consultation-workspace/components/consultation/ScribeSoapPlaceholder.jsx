"use client";

import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SOAP_SKELETON = [
  ["S", "Subjective"],
  ["O", "Objective"],
  ["A", "Assessment"],
  ["P", "Plan & Recommendations"],
];

export function ScribeSoapPlaceholder({
  processing,
  message,
  recordState = "idle",
  patientSelected = false,
}) {
  const capturing = recordState === "recording" || recordState === "paused";
  const statusLabel = capturing
    ? "Audio Stream Ingesting…"
    : patientSelected
      ? "Ready for Consultation"
      : "Awaiting Audio";
  const hint = processing
    ? (message ?? "Processing…")
    : capturing
      ? "Click the red “Stop recording” button when the consultation concludes to generate clinical note"
      : patientSelected
        ? "Press “Start recording” to begin ambient clinical capture"
        : "Select a patient on the left and start recording the encounter";

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-card"
      data-testid="soap-review-workspace"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 px-2 text-xs font-semibold tracking-wide text-primary">
            SOAP
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-semibold text-heading">Clinical SOAP Note</h2>
            <p className="text-xs text-gray-700 dark:text-gray-300">Structured Medical Documentation</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            capturing && "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
            !capturing && patientSelected && "bg-primary/10 text-primary",
            !capturing && !patientSelected && "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
          )}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
          {statusLabel}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4 md:px-5">
        <div className="space-y-4">
          {SOAP_SKELETON.map(([letter, label]) => {
            const extracting = capturing && letter === "S";
            return (
              <section
                key={letter}
                className={cn(
                  "rounded-lg px-3 py-3",
                  extracting ? "bg-[#EEF0FF] dark:bg-primary/15" : "bg-muted/70",
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                      extracting ? "bg-white text-primary" : "bg-card text-gray-600 dark:text-gray-300",
                    )}>
                      {letter}
                    </span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">{label}</h3>
                  </div>
                  {extracting ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Extracting symptoms…
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2" aria-hidden>
                  <div className={cn("h-2 w-full rounded-full", extracting ? "bg-primary/25" : "bg-gray-200 dark:bg-gray-700")} />
                  <div className={cn("h-2 w-4/5 rounded-full", extracting ? "bg-primary/20" : "bg-gray-200 dark:bg-gray-700")} />
                  <div className={cn("h-2 w-2/3 rounded-full", extracting ? "bg-primary/15" : "bg-gray-100 dark:bg-gray-800")} />
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col items-center px-4 pb-2 pt-8 text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-gray-500">
            <FileText className="h-5 w-5" aria-hidden />
          </div>
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Your note will appear here after transcription
          </p>
          <p className="mt-1 max-w-sm text-xs text-gray-700 dark:text-gray-300">{hint}</p>
        </div>
      </div>
    </div>
  );
}
