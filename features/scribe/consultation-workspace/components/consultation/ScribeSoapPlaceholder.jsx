"use client";

import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScribePanelHeader } from "./ScribePanelHeader.jsx";

export function ScribeSoapPlaceholder({ processing, message, onOpenSessions, hasSessions = false }) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-white transition-opacity duration-200",
        !processing && "opacity-60",
      )}
      data-testid="soap-review-workspace"
    >
      <ScribePanelHeader
        title="SOAP Note"
        subtitle="AI-generated clinical documentation"
        onOpenSessions={onOpenSessions}
        showSessions={hasSessions}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        {processing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-gray-600">{message ?? "Processing…"}</p>
          </>
        ) : (
          <>
            <div className="rounded-full bg-muted p-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Start a recording to generate a SOAP note. Your clinical note will appear here after transcription.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
