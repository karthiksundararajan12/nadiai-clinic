"use client";

import { useEffect } from "react";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * @param {{
 *   message: string;
 *   variant?: "default" | "warning" | "error";
 *   onDismiss: () => void;
 *   durationMs?: number;
 * }} props
 */
export function Toast({
  message,
  variant = "warning",
  onDismiss,
  durationMs = 5000,
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onDismiss]);

  return (
    <div
      role="alert"
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg animate-in slide-in-from-top-2 fade-in duration-300",
        variant === "error" && "border-red-200 bg-red-50 text-red-800",
        variant === "warning" && "border-amber-200 bg-amber-50 text-amber-900",
        variant === "default" && "border-gray-200 bg-white text-gray-900",
      )}
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 opacity-80" />
      <p className="flex-1 text-sm leading-snug">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
