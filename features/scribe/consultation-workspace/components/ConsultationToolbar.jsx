"use client";

import { CheckCircle2, Loader2, Save, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ConsultationToolbar({
  sessionStatus,
  transcriptDirty,
  soapDirty,
  saving,
  completingReview = false,
  autosaveStatus,
  canCompleteReview,
  canGenerateSOAP,
  generatingSOAP,
  canApproveSOAP,
  soapApproved,
  actionError = null,
  onSave,
  onCompleteReview,
  onGenerateSOAP,
  onRejectSOAP,
}) {
  const hasChanges = transcriptDirty || soapDirty;
  const busy = saving || completingReview || generatingSOAP;

  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {sessionStatus && (
          <Badge variant="secondary" className="text-xs">
            {sessionStatus.replace(/_/g, " ")}
          </Badge>
        )}
        <Badge variant={hasChanges ? "warning" : "success"} className="text-xs">
          {hasChanges ? "Unsaved changes" : "Saved"}
        </Badge>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Autosave: {autosaveStatus}
        </span>
      </div>

      <div className="flex flex-col items-stretch gap-2 md:items-end">
        {actionError && (
          <p
            className="max-w-md text-right text-xs text-rose-600"
            role="alert"
            data-testid="scribe-toolbar-action-error"
          >
            {actionError}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onSave}
            disabled={busy || !hasChanges || soapApproved}
            data-testid="scribe-toolbar-save"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? "Saving…" : "Save"}
          </Button>

          {canCompleteReview && (
            <Button
              size="sm"
              variant="secondary"
              data-testid="scribe-complete-review"
              onClick={onCompleteReview}
              disabled={busy || transcriptDirty}
            >
              {completingReview ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CheckCircle2 className="size-4" />
              )}
              {completingReview ? "Completing…" : "Complete review"}
            </Button>
          )}

          {canGenerateSOAP && (
            <Button
              size="sm"
              data-testid="scribe-generate-soap"
              onClick={onGenerateSOAP}
              disabled={busy || transcriptDirty}
            >
              {generatingSOAP ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {generatingSOAP ? "Generating…" : "Generate SOAP"}
            </Button>
          )}

          {canApproveSOAP && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRejectSOAP}
              disabled={busy || soapDirty}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
