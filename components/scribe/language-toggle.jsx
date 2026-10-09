"use client";

import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { SCRIBE_LANGUAGES } from "@/lib/constants";
import { ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";

export function LanguageToggle({ value, onChange, disabled = false, variant = "default" }) {
  if (variant === "segmented") {
    return (
      <div
        className={cn(
          "flex w-full max-w-full rounded-lg bg-muted p-1",
          disabled && "pointer-events-none opacity-60",
        )}
        aria-label="Consultation language"
      >
        {SCRIBE_LANGUAGES.map((lang) => {
          const selected = value === lang.value;
          return (
            <button
              key={lang.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(lang.value)}
              className={cn(
                "min-w-0 flex-1 rounded-md px-3 py-1.5 text-center text-xs font-medium transition-colors",
                selected
                  ? "bg-white text-primary shadow-sm dark:bg-card"
                  : "text-gray-600 hover:text-primary dark:text-gray-300",
                disabled && "cursor-not-allowed",
              )}
            >
              {lang.label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-white p-1">
      <Languages
        className={`${ICON_SIZE_SM} ml-2 text-muted-foreground`}
        strokeWidth={ICON_STROKE}
        aria-hidden
      />
      {SCRIBE_LANGUAGES.map((lang) => (
        <button
          key={lang.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(lang.value)}
          className={cn(
            "rounded-lg px-3 py-1 text-body font-medium transition-colors",
            value === lang.value
              ? "bg-primary-soft text-primary shadow-sm"
              : "text-muted-foreground hover:bg-primary-soft hover:text-primary",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <span className="mr-2 text-caption font-semibold opacity-80">{lang.shortLabel}</span>
          {lang.label}
        </button>
      ))}
    </div>
  );
}
