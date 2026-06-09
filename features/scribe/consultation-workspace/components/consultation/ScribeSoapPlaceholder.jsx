"use client";

import { Loader2 } from "lucide-react";

export function ScribeSoapPlaceholder({ processing, message }) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="soap-review-workspace">
      <div className="shrink-0 border-b border-gray-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-gray-900">SOAP Note</h2>
        <p className="mt-0.5 text-xs text-gray-500">AI-generated clinical documentation</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        {processing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600" />
            <p className="text-sm text-gray-600">{message ?? "Processing…"}</p>
          </>
        ) : (
          <p className="max-w-sm text-sm text-gray-500">
            Start a recording to generate a SOAP note. Your clinical note will appear here after transcription.
          </p>
        )}
      </div>
    </div>
  );
}
