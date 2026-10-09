"use client";

import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SCRIBE_WORKFLOW_STEPS } from "../../lib/scribe-workflow-step.js";

const DISPLAY_LABELS = ["Record", "Transcribe", "Note", "Prescription", "Approve"];

export function ScribeWorkflowStepper({ activeIndex = 0, liveRecording = false }) {
  const current = Math.min(
    Math.max(activeIndex, 0),
    SCRIBE_WORKFLOW_STEPS.length - 1,
  );

  return (
    <nav
      aria-label="Scribe workflow"
      className="scribe-card shrink-0 overflow-x-auto rounded-xl px-4 py-3"
      data-testid="scribe-workflow-stepper"
    >
      <ol className="flex min-w-max items-center lg:min-w-0 lg:w-full">
        {SCRIBE_WORKFLOW_STEPS.map((step, index) => {
          const active = index === current;
          const done = index < current;
          const upcoming = index > current;
          const live = liveRecording && active && index === 0;
          const label = live ? "Record (Live)" : (DISPLAY_LABELS[index] ?? step.label);
          return (
            <li key={step.id} className={cn("flex items-center", index > 0 && "lg:flex-1")}>
              {index > 0 && (
                <span
                  className="scribe-step-connector mx-2 h-px w-6 shrink-0 sm:w-10 lg:w-auto lg:min-w-4 lg:flex-1"
                  aria-hidden
                />
              )}
              <div
                className="flex items-center gap-2.5"
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    live && "bg-red-600 text-white",
                    done && !live && "scribe-step-done",
                    active && !live && "scribe-step-current",
                    upcoming && "scribe-step-upcoming",
                  )}
                >
                  {done && !live ? (
                    <Check size={18} weight="bold" aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "scribe-step-label whitespace-nowrap",
                    live && "font-bold text-red-600",
                    active && !live && "scribe-step-label-active",
                    upcoming && "scribe-text-muted",
                    done && !live && "scribe-text-muted",
                  )}
                >
                  {label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
