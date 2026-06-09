"use client";

import { Loader2 } from "lucide-react";

/**
 * Right-panel loading state while audio uploads or transcribes.
 */
export function TranscriptionPendingView({
  message,
  onOpenSessions,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="consultation-workspace">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">SOAP Note</h2>
          <p className="text-xs text-gray-500">Preparing your clinical note…</p>
        </div>
        {onOpenSessions && (
          <button
            type="button"
            className="cursor-pointer text-xs text-cyan-600 hover:underline"
            onClick={onOpenSessions}
          >
            Sessions
          </button>
        )}
      </div>
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12"
        data-testid="transcript-review-workspace"
      >
        <Loader2 className="h-10 w-10 animate-spin text-cyan-600" aria-hidden />
        <div className="max-w-md text-center">
          <p className="text-sm font-medium text-gray-800">{message}</p>
          <p className="mt-2 text-xs text-gray-500">
            Your SOAP note will appear here when transcription completes.
          </p>
        </div>
      </div>
    </div>
  );
}
