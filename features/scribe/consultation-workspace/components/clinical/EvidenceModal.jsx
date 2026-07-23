"use client";

import { AlertTriangle, CircleX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";

/**
 * @param {{
 *   open: boolean;
 *   onOpenChange: (open: boolean) => void;
 *   evidence: import("../../lib/soap-statement-evidence.js").SoapStatementEvidence | null;
 *   onEditStatement?: () => void;
 *   onDeleteStatement?: () => void;
 *   onRegenerateSoap?: () => void;
 * }} props
 */
export function EvidenceModal({
  open,
  onOpenChange,
  evidence,
  onEditStatement,
  onDeleteStatement,
  onRegenerateSoap,
}) {
  const hasEvidence = evidence && evidence.status !== "none" && evidence.evidenceText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" onClose={() => onOpenChange(false)}>
        <DialogHeader>
          <DialogTitle>Source Evidence</DialogTitle>
        </DialogHeader>

        {!evidence ? (
          <p className="py-6 text-center text-sm text-gray-500">No evidence selected.</p>
        ) : hasEvidence ? (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                Source Transcript
              </p>
              <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs font-semibold text-gray-700">
                  Speaker:{" "}
                  <span className="font-medium text-gray-900">
                    {evidence.speaker ?? "Unknown"}
                  </span>
                </p>
                <p className="mt-2 text-sm leading-relaxed text-gray-800">
                  &ldquo;{evidence.evidenceText}&rdquo;
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
              <span className="text-xs font-medium text-gray-600">Confidence</span>
              <span
                className={cn(
                  "text-sm font-bold tabular-nums",
                  evidence.confidence >= 70 ? "text-emerald-600" : "text-amber-600",
                )}
              >
                {evidence.confidence}%
              </span>
            </div>

            {evidence.confidence < 70 && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle
                  className={cn(ICON_SIZE_SM, "mt-0.5 shrink-0")}
                  strokeWidth={ICON_STROKE}
                  aria-hidden
                />
                <span>
                  This statement may contain inferred information. Please verify.
                </span>
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800">
              <CircleX
                className={cn(ICON_SIZE_SM, "mt-0.5 shrink-0")}
                strokeWidth={ICON_STROKE}
                aria-hidden
              />
              <span>No Supporting Evidence Found</span>
            </div>
            <p className="text-xs text-gray-600">
              This statement could not be matched to the consultation transcript. You can
              edit it, remove it, or regenerate the SOAP note.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer"
                onClick={onEditStatement}
              >
                Edit Statement
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer text-red-600 hover:text-red-700"
                onClick={onDeleteStatement}
              >
                Delete Statement
              </Button>
              <Button
                type="button"
                size="sm"
                className="cursor-pointer"
                onClick={onRegenerateSoap}
              >
                Regenerate SOAP
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
