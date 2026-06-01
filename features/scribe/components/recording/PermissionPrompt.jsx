"use client";

/**
 * PermissionPrompt — shown when microphone permission is needed or was denied.
 *
 * States handled:
 *  - "unsupported" — browser cannot record at all
 *  - "denied"      — user blocked the mic; instructions to fix
 *  - "dismissed"   — dialog was closed without a choice
 *  - "error"       — other RecordingError with retry option
 */

import { Mic, MicOff, AlertTriangle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { isRecordingError } from "@/features/scribe/recording/errors.js";

/**
 * @param {{
 *   error:        import("../../recording/errors.js").RecordingError | null;
 *   onRetry?:     () => void;
 *   className?:   string;
 * }} props
 */
export function PermissionPrompt({ error, onRetry, className }) {
  if (!error) return null;

  const isDenied      = error.code === "PERMISSION_DENIED";
  const isDismissed   = error.code === "PERMISSION_DISMISSED";
  const isUnsupported = error.code === "BROWSER_NOT_SUPPORTED";
  const isDeviceMissing = error.code === "DEVICE_NOT_FOUND";

  const icon = isUnsupported || isDenied
    ? <MicOff className="size-6 text-rose-400" />
    : <Mic    className="size-6 text-amber-400" />;

  const accentColor = isUnsupported || isDenied
    ? "border-rose-500/30 bg-rose-500/5"
    : "border-amber-500/30 bg-amber-500/5";

  return (
    <div
      role="alert"
      className={cn(
        "rounded-xl border p-4 flex flex-col gap-3",
        accentColor,
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex-shrink-0">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-white leading-snug">
            {getTitle(error.code)}
          </p>
          <p className="mt-0.5 text-xs text-slate-400 leading-relaxed">
            {error.message}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pl-9">
        {/* Retry button — only for recoverable errors */}
        {error.recoverable && onRetry && !isDenied && (
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold",
              "bg-emerald-600 text-white hover:bg-emerald-500",
              "transition-colors",
            )}
          >
            Try Again
          </button>
        )}

        {/* Browser-settings deep-link for denied permission */}
        {isDenied && (
          <BrowserSettingsHint />
        )}

        {/* Unsupported browser: suggest alternatives */}
        {isUnsupported && (
          <a
            href="https://www.google.com/chrome/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Download Chrome
            <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function BrowserSettingsHint() {
  const isIos =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent);

  return (
    <p className="text-xs text-slate-400 leading-relaxed">
      {isIos
        ? "Go to Settings → Safari → Microphone and allow access, then reload this page."
        : "Click the camera/lock icon in your browser's address bar → allow Microphone, then reload."}
    </p>
  );
}

function getTitle(code) {
  switch (code) {
    case "PERMISSION_DENIED":      return "Microphone access blocked";
    case "PERMISSION_DISMISSED":   return "Microphone permission required";
    case "BROWSER_NOT_SUPPORTED":  return "Recording not supported";
    case "DEVICE_NOT_FOUND":       return "No microphone detected";
    case "DEVICE_IN_USE":          return "Microphone is in use";
    case "RECORDING_INTERRUPTED":  return "Recording interrupted";
    default:                       return "Recording error";
  }
}
