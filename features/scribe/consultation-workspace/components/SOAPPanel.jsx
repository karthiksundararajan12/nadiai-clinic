"use client";

import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SOAP_SECTIONS } from "../../soap-review/hooks/use-soap-review.js";

const SOAP_AVAILABLE_STATUSES = new Set([
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
  "SOAP_APPROVED",
  "READY_FOR_PRESCRIPTION",
  "GENERATING_PRESCRIPTION",
  "PRESCRIPTION_DRAFT_READY",
  "PRESCRIPTION_REVIEW_REQUIRED",
  "PRESCRIPTION_REVIEWING",
  "PRESCRIPTION_APPROVED",
  "COMPLETED",
]);

export { SOAP_AVAILABLE_STATUSES };

export function SOAPEmptyPanel({
  sessionStatus,
  generating,
  canGenerate,
  onGenerate,
}) {
  return (
    <div className="flex min-h-0 flex-col bg-muted/10">
      <div className="shrink-0 border-b px-4 py-3">
        <h3 className="text-sm font-semibold">SOAP Note</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Clinical note generated from the conversation</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        {generating ? (
          <>
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating SOAP note from transcript…</p>
          </>
        ) : (
          <>
            <div className="rounded-full bg-primary/10 p-4">
              <Sparkles className="size-6 text-primary" />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-medium">No SOAP note yet</p>
              <p className="text-xs text-muted-foreground">
                {sessionStatus === "REVIEWING"
                  ? "Finish reviewing the conversation, then complete review."
                  : canGenerate
                    ? "Complete transcript review, then generate the SOAP note."
                    : "SOAP will appear here once the transcript is ready."}
              </p>
            </div>
            {canGenerate && (
              <Button size="sm" onClick={onGenerate} data-testid="scribe-generate-soap-inline">
                <Sparkles className="size-4" />
                Generate SOAP
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function SOAPEditorPanel({
  draft,
  dirty,
  original,
  readOnly,
  saving,
  loading,
  error,
  onChange,
  onRetry,
}) {
  if (loading) {
    return (
      <div className="flex min-h-0 flex-col bg-muted/10">
        <PanelHeader />
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading SOAP note…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-col bg-muted/10">
        <PanelHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const disabled = readOnly || saving;

  return (
    <div
      className="flex min-h-0 flex-col bg-muted/10"
      data-testid="soap-review-workspace"
    >
      <PanelHeader readOnly={readOnly} />
      <ScrollArea className="flex-1 min-h-[420px] lg:min-h-[calc(100vh-260px)]">
        <div className="space-y-4 p-4">
          {SOAP_SECTIONS.map(([sectionKey, label]) => (
            <SOAPSection
              key={sectionKey}
              label={label}
              value={draft[sectionKey]}
              modified={(original[sectionKey] ?? "") !== (draft[sectionKey] ?? "")}
              dirty={Boolean(dirty[sectionKey])}
              disabled={disabled}
              onChange={(value) => onChange(sectionKey, value)}
              rows={sectionKey === "clinicalSummary" ? 4 : 3}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function PanelHeader({ readOnly }) {
  return (
    <div className="shrink-0 border-b px-4 py-3">
      <h3 className="text-sm font-semibold">SOAP Note</h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        {readOnly ? "Approved — read only" : "Review and edit each section before approval"}
      </p>
    </div>
  );
}

function SOAPSection({ label, value, modified, dirty, disabled, onChange, rows }) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-3",
        dirty && "border-primary/40",
        modified && !dirty && "border-amber-400/40",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {dirty && <span className="text-[10px] text-primary">Unsaved</span>}
        {modified && !dirty && <span className="text-[10px] text-amber-600">Modified</span>}
      </div>
      <Textarea
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={rows}
        className="min-h-0 resize-none border-0 bg-transparent px-0 py-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        aria-label={`${label} editor`}
      />
    </div>
  );
}
