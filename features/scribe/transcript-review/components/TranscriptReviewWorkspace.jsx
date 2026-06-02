"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranscriptReview } from "../hooks/use-transcript-review.js";
import { ReviewToolbar } from "./ReviewToolbar.jsx";
import { TranscriptSegmentCard } from "./TranscriptSegmentCard.jsx";
import { VersionHistoryPanel } from "./VersionHistoryPanel.jsx";
import { EmptyTranscriptState, ReviewErrorState, ReviewLoadingState } from "./ReviewStateViews.jsx";

export function TranscriptReviewWorkspace({ sessionId, className }) {
  const review = useTranscriptReview(sessionId);
  const readOnly = review.readOnly;
  const canCompleteReview = !readOnly && review.session?.status === "REVIEWING";
  const canGenerateSOAP = !readOnly && [
    "REVIEW_COMPLETED",
    "SOAP_READY",
    "SOAP_REVIEW_REQUIRED",
  ].includes(review.session?.status);

  const stats = useMemo(() => {
    const low = review.segments.filter((segment) => segment.is_low_confidence).length;
    return { low, total: review.segments.length };
  }, [review.segments]);

  if (review.loading) return <ReviewLoadingState />;
  if (review.error) return <ReviewErrorState error={review.error} onRetry={review.load} />;

  return (
    <section className={className} aria-label="Transcript review workspace" data-testid="transcript-review-workspace">
      {readOnly && (
        <p className="mb-3 text-sm text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
          Archived consultation — transcript is read-only.
        </p>
      )}
      {!readOnly && (
        <ReviewToolbar
          hasChanges={review.hasChanges}
          saving={review.saving}
          autosaveStatus={review.autosaveStatus}
          canUndo={review.canUndo}
          canRedo={review.canRedo}
          canComplete={canCompleteReview}
          canGenerateSOAP={canGenerateSOAP}
          generatingSOAP={review.generatingSOAP}
          onUndo={review.undo}
          onRedo={review.redo}
          onSave={review.manualSave}
          onComplete={review.completeReview}
          onGenerateSOAP={review.generateSOAP}
        />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{review.session?.status}</Badge>
            <Badge variant={stats.low > 0 ? "warning" : "success"}>
              {stats.low} low-confidence / {stats.total} segments
            </Badge>
          </div>

          <Tabs defaultValue="segments">
            <TabsList>
              <TabsTrigger value="segments">Segments</TabsTrigger>
              <TabsTrigger value="plain">Plain text</TabsTrigger>
            </TabsList>

            <TabsContent value="segments">
              {review.segments.length === 0 ? (
                <EmptyTranscriptState />
              ) : (
                <ScrollArea className="max-h-[calc(100vh-220px)] pr-2">
                  <div className="space-y-3">
                    {review.segments.map((segment) => (
                      <TranscriptSegmentCard
                        key={segment.id}
                        segment={segment}
                        dirty={Boolean(review.dirty[segment.id])}
                        disabled={readOnly || review.saving || review.session?.status === "REVIEW_COMPLETED"}
                        onChange={review.updateSegment}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>

            <TabsContent value="plain">
              <div className="rounded-xl border bg-muted/20 p-4 text-sm leading-7 whitespace-pre-wrap">
                {review.segments.map((segment) => `${segment.speaker_label}: ${segment.text}`).join("\n\n")}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <VersionHistoryPanel
          versions={review.versions}
          onRestore={review.restoreVersion}
          disabled={readOnly || review.saving || review.session?.status === "REVIEW_COMPLETED"}
        />
      </div>
    </section>
  );
}
