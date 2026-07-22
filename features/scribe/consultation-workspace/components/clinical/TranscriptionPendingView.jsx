"use client";

import { Loader2 } from "lucide-react";
import { ScribePanelHeader } from "../consultation/ScribePanelHeader.jsx";

/**
 * Right-panel loading state while audio uploads or transcribes.
 */
export function TranscriptionPendingView({
  message,
  onOpenSessions,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="consultation-workspace">
      <ScribePanelHeader
        title="SOAP Note"
        subtitle="Preparing your clinical note…"
        onOpenSessions={onOpenSessions}
      />
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-white px-6 py-12"
        data-testid="transcript-review-workspace"
      >
        <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden />
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
