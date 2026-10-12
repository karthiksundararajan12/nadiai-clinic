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
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-[color:var(--scribe-card-bg)]"
      data-testid="soap-review-workspace"
    >
      <div className="flex shrink-0 flex-col items-start gap-2 border-b border-[color:var(--scribe-card-border)] px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-3 md:px-5 min-[1920px]:px-8 min-[1920px]:py-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="scribe-icon-tile flex h-10 w-10 shrink-0 items-center justify-center px-0 min-[1920px]:h-12 min-[1920px]:w-12">
            <FileText size={22} weight="duotone" className="scribe-icon" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2 className="break-words text-sm font-bold text-[color:var(--scribe-heading)] min-[1920px]:text-xl">Clinical SOAP Note</h2>
            <p className="scribe-text-muted break-words text-sm font-medium">Structured Medical Documentation</p>
          </div>
        </div>
        <span
          className={cn(
            "inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold break-words min-[1920px]:text-base",
            capturing && "bg-red-50 text-red-700",
            !capturing && patientSelected && "bg-[color:var(--scribe-indigo-50)] text-[color:var(--scribe-indigo-600)]",
            !capturing && !patientSelected && "bg-[color:var(--scribe-indigo-50)] scribe-text-muted",
          )}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          {statusLabel}
        </span>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5 md:py-5 min-[1920px]:px-8 min-[1920px]:py-6">
        <div className="space-y-4 min-[1920px]:space-y-6">
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
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="scribe-letter-tile h-7 w-7 shrink-0 min-[1920px]:h-9 min-[1920px]:w-9 min-[1920px]:text-base">
                      {letter}
                    </span>
                    <h3 className="min-w-0 break-words text-sm font-bold uppercase tracking-wide text-[color:var(--scribe-heading)] min-[1920px]:text-lg">
                      {label}
                    </h3>
                  </div>
                  {extracting ? (
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold break-words text-[color:var(--scribe-indigo-600)] min-[1920px]:text-base">
                      <CircleNotch size={16} weight="bold" className="shrink-0 animate-spin" />
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

        <div className="mt-auto flex flex-col items-center px-4 pb-2 pt-8 text-center min-[1920px]:pt-12">
          <div className="scribe-icon-tile mb-3 flex h-11 w-11 items-center justify-center min-[1920px]:h-14 min-[1920px]:w-14">
            <FileText size={22} weight="duotone" className="scribe-icon" aria-hidden />
          </div>
          <p className="break-words text-sm font-semibold text-[color:var(--scribe-heading)] min-[1920px]:text-lg">
            Your note will appear here after transcription
          </p>
          <p className="scribe-text-muted mt-1 max-w-sm break-words text-sm font-medium min-[1920px]:max-w-md">{hint}</p>
        </div>
      </div>
    </div>
  );
}
