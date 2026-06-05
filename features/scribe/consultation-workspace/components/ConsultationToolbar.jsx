"use client";

import { CheckCircle2, Loader2, Save, Sparkles, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function ConsultationToolbar({
  sessionStatus,
  transcriptDirty,
  soapDirty,
  saving,
  autosaveStatus,
  canCompleteReview,
  canGenerateSOAP,
  generatingSOAP,
  canApproveSOAP,
  soapApproved,
  onSave,
  onCompleteReview,
  onGenerateSOAP,
  onApproveSOAP,
  onRejectSOAP,
}) {
  const hasChanges = transcriptDirty || soapDirty;

  return (
    <div className="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 md:flex-row md:items-center md:justify-between">
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

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onSave}
          disabled={saving || !hasChanges || soapApproved}
        >
          <Save className="size-4" />
          Save
        </Button>

        {canCompleteReview && (
          <Button
            size="sm"
            variant="secondary"
            data-testid="scribe-complete-review"
            onClick={onCompleteReview}
            disabled={saving || transcriptDirty || generatingSOAP}
          >
            <CheckCircle2 className="size-4" />
            Complete review
          </Button>
        )}

        {canGenerateSOAP && (
          <Button
            size="sm"
            data-testid="scribe-generate-soap"
            onClick={onGenerateSOAP}
            disabled={saving || transcriptDirty || generatingSOAP}
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
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onRejectSOAP}
              disabled={saving || soapDirty}
            >
              <XCircle className="size-4" />
              Reject
            </Button>
            <Button
              size="sm"
              data-testid="soap-approve"
              onClick={onApproveSOAP}
              disabled={saving || soapDirty}
            >
              <CheckCircle2 className="size-4" />
              Approve SOAP
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
