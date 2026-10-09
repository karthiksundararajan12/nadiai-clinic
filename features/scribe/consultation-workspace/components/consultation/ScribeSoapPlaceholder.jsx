"use client";

import { CircleNotch, FileText } from "@phosphor-icons/react";
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
      className="flex h-full min-h-0 flex-col bg-[color:var(--scribe-card-bg)]"
      data-testid="soap-review-workspace"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[color:var(--scribe-card-border)] px-4 py-3.5 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="scribe-icon-tile flex h-10 w-10 shrink-0 items-center justify-center px-0">
            <FileText size={22} weight="duotone" className="scribe-icon" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[color:var(--scribe-heading)]">Clinical SOAP Note</h2>
            <p className="scribe-text-muted text-sm font-medium">Structured Medical Documentation</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold",
            capturing && "bg-red-50 text-red-700",
            !capturing && patientSelected && "bg-[color:var(--scribe-indigo-50)] text-[color:var(--scribe-indigo-600)]",
            !capturing && !patientSelected && "bg-[color:var(--scribe-indigo-50)] scribe-text-muted",
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
                  "rounded-lg border border-[color:var(--scribe-card-border)] px-3 py-3",
                  extracting
                    ? "bg-[color:var(--scribe-indigo-50)]"
                    : "bg-[color:var(--scribe-card-bg)]",
                )}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="scribe-letter-tile h-7 w-7 shrink-0">
                      {letter}
                    </span>
                    <h3 className="text-sm font-bold uppercase tracking-wide text-[color:var(--scribe-heading)]">
                      {label}
                    </h3>
                  </div>
                  {extracting ? (
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-[color:var(--scribe-indigo-600)]">
                      <CircleNotch size={16} weight="bold" className="animate-spin" />
                      Extracting symptoms…
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2" aria-hidden>
                  <div className="scribe-skeleton-bar h-2 w-full" />
                  <div className="scribe-skeleton-bar h-2 w-4/5" />
                  <div className="scribe-skeleton-bar h-2 w-2/3 opacity-80" />
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-auto flex flex-col items-center px-4 pb-2 pt-8 text-center">
          <div className="scribe-icon-tile mb-3 flex h-11 w-11 items-center justify-center">
            <FileText size={22} weight="duotone" className="scribe-icon" aria-hidden />
          </div>
          <p className="text-sm font-semibold text-[color:var(--scribe-heading)]">
            Your note will appear here after transcription
          </p>
          <p className="scribe-text-muted mt-1 max-w-sm text-sm font-medium">{hint}</p>
        </div>
      </div>
    </div>
  );
}
