"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_SIZE_MD, ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
  disabled = false,
  title,
}) {
  return (
    <div className={cn("relative", className)} title={title}>
      <Search
        className={`absolute left-3 top-1/2 ${ICON_SIZE_MD} -translate-y-1/2 text-muted-foreground`}
        strokeWidth={ICON_STROKE}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        title={title}
        aria-disabled={disabled || undefined}
        className={cn(
          "h-9 w-full rounded-lg border border-input bg-transparent pl-9 pr-9 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:border-ring",
          disabled && "cursor-not-allowed opacity-60",
        )}
      />
      {value && !disabled && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
        </button>
      )}
    </div>
  );
}
