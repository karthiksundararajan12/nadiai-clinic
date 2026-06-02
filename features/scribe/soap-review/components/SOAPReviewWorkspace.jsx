"use client";

import { useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSOAPReview, SOAP_SECTIONS } from "../hooks/use-soap-review.js";
import { SOAPComparePanel } from "./SOAPComparePanel.jsx";
import { SOAPReviewToolbar } from "./SOAPReviewToolbar.jsx";
import { SOAPSectionEditor } from "./SOAPSectionEditor.jsx";
import { SOAPVersionHistoryPanel } from "./SOAPVersionHistoryPanel.jsx";
import { EmptySOAPState, SOAPReviewErrorState, SOAPReviewLoadingState } from "./SOAPReviewStateViews.jsx";

export function SOAPReviewWorkspace({ sessionId, className, onApproved, onBack }) {
  const review = useSOAPReview(sessionId);

  const handleReject = useCallback(async () => {
    const reason = window.prompt("Enter rejection reason for this SOAP note:");
    if (!reason?.trim()) return;
    await review.reject(reason.trim());
  }, [review]);

  const handleApprove = useCallback(async () => {
    await review.approve();
    onApproved?.();
  }, [onApproved, review]);

  if (review.loading) return <SOAPReviewLoadingState />;
  if (review.error) return <SOAPReviewErrorState error={review.error} onRetry={review.load} />;
  if (!review.note) return <EmptySOAPState />;

  const approved = review.readOnly ||
    review.session?.status === "SOAP_APPROVED" ||
    review.session?.status === "COMPLETED" ||
    review.session?.status === "READY_FOR_PRESCRIPTION";

  return (
    <section className={className} aria-label="SOAP review workspace">
      <SOAPReviewToolbar
        status={review.session?.status}
        hasChanges={review.hasChanges}
        saving={review.saving}
        autosaveStatus={review.autosaveStatus}
        canUndo={review.canUndo}
        canRedo={review.canRedo}
        onUndo={review.undo}
        onRedo={review.redo}
        onSave={review.manualSave}
        onApprove={handleApprove}
        onReject={handleReject}
      />

      {approved && onBack && (
        <p className="mt-2 text-sm text-muted-foreground">
          This consultation is archived.{" "}
          <button type="button" className="underline text-primary" onClick={onBack}>
            Return to consultations
          </button>
        </p>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              Session {sessionId.slice(0, 8)}…
            </Badge>
            <Badge variant="secondary">SOAP note #{review.note?.id?.slice(0, 8)}</Badge>
            <Badge variant={approved ? "success" : "warning"}>
              {review.note?.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Provider: {review.note?.provider} · Model: {review.note?.model}
            </span>
          </div>

          <Tabs defaultValue="edit">
            <TabsList>
              <TabsTrigger value="edit">Edit sections</TabsTrigger>
              <TabsTrigger value="summary">Clinical summary</TabsTrigger>
              <TabsTrigger value="compare">Compare</TabsTrigger>
            </TabsList>

            <TabsContent value="edit">
              <ScrollArea className="max-h-[calc(100vh-240px)] pr-2">
                <div className="space-y-3">
                  {SOAP_SECTIONS.slice(0, -1).map(([sectionKey, label]) => (
                    <SOAPSectionEditor
                      key={sectionKey}
                      sectionKey={sectionKey}
                      label={label}
                      value={review.draft[sectionKey]}
                      originalValue={review.original[sectionKey]}
                      dirty={Boolean(review.dirty[sectionKey])}
                      disabled={review.saving || approved}
                      onChange={review.updateSection}
                    />
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="summary">
              <SOAPSectionEditor
                sectionKey="clinicalSummary"
                label="Clinical Summary"
                value={review.draft.clinicalSummary}
                originalValue={review.original.clinicalSummary}
                dirty={Boolean(review.dirty.clinicalSummary)}
                disabled={review.saving || approved}
                onChange={review.updateSection}
              />
            </TabsContent>

            <TabsContent value="compare">
              <SOAPComparePanel comparison={review.comparison} />
            </TabsContent>
          </Tabs>
        </div>

        <SOAPVersionHistoryPanel
          versions={review.versions}
          onCompare={review.compare}
        />
      </div>
    </section>
  );
}
