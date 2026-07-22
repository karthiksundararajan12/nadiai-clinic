"use client";

import { FileText, Loader2 } from "lucide-react";
import { ScribePanelHeader } from "./ScribePanelHeader.jsx";

export function ScribeSoapPlaceholder({ processing, message, onOpenSessions, hasSessions = false }) {
  return (
    <div
      className="flex h-full min-h-0 flex-col bg-white"
      data-testid="soap-review-workspace"
    >
      <ScribePanelHeader
        title="SOAP Note"
        subtitle="AI-generated clinical documentation"
        onOpenSessions={onOpenSessions}
        showSessions={hasSessions}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-white px-6 py-12 text-center">
        {processing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-gray-600">{message ?? "Processing…"}</p>
          </>
        ) : (
          <>
            <div className="rounded-full bg-gray-100 p-4">
              <FileText className="h-8 w-8 text-gray-400" />
            </div>
            <p className="max-w-sm text-sm text-gray-500">
              Start a recording to generate a SOAP note. Your clinical note will appear here after transcription.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
