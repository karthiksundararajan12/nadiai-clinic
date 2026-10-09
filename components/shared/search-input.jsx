"use client";

import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

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
      <MagnifyingGlass
        size={18}
        weight="bold"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-icon-muted"
        aria-hidden
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
          "h-10 w-full rounded-[var(--radius)] border border-input bg-card pl-10 pr-10 text-body font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:border-primary",
          disabled && "cursor-not-allowed opacity-60",
        )}
      />
      {value && !disabled && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-icon-muted transition-colors hover:text-foreground"
          aria-label="Clear search"
        >
          <X size={16} weight="bold" aria-hidden />
        </button>
      )}
    </div>
  );
}
