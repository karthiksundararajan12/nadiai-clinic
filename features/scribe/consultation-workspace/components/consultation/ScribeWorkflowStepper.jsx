"use client";

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
      className="shrink-0 overflow-x-auto rounded-xl border border-border bg-card px-4 py-3 shadow-clinical"
      data-testid="scribe-workflow-stepper"
    >
      <ol className="flex min-w-max items-center lg:min-w-0 lg:w-full">
        {SCRIBE_WORKFLOW_STEPS.map((step, index) => {
          const active = index === current;
          const live = liveRecording && active && index === 0;
          const label = live ? "Record (Live)" : (DISPLAY_LABELS[index] ?? step.label);
          return (
            <li key={step.id} className={cn("flex items-center", index > 0 && "lg:flex-1")}>
              {index > 0 && (
                <span className="mx-2 h-px w-6 shrink-0 bg-border sm:w-10 lg:w-auto lg:min-w-4 lg:flex-1" aria-hidden />
              )}
              <div
                className="flex items-center gap-2"
                aria-current={active ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    live && "bg-red-600 text-white",
                    active && !live && "bg-primary text-primary-foreground",
                    !active && "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-100",
                  )}
                >
                  {index + 1}
                </span>
                <span
                  className={cn(
                    "whitespace-nowrap text-xs font-medium",
                    live && "text-red-600 dark:text-red-400",
                    active && !live && "text-primary",
                    !active && "text-gray-700 dark:text-gray-200",
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
