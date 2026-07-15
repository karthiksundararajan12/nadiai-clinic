"use client";

import { cn } from "@/lib/utils";
import { SCRIBE_LANGUAGES } from "@/lib/constants";

export function LanguageToggle({ value, onChange, disabled = false }) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1">
      {SCRIBE_LANGUAGES.map((lang) => (
        <button
          key={lang.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(lang.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === lang.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
            disabled && "pointer-events-none opacity-50",
          )}
        >
          <span className="text-sm">{lang.flag}</span>
          {lang.label}
        </button>
      ))}
    </div>
  );
}
