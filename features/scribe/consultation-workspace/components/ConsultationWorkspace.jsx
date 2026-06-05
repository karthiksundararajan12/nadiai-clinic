"use client";

import { useCallback } from "react";
import { useTranscriptReview } from "../../transcript-review/hooks/use-transcript-review.js";
import { useSOAPReview } from "../../soap-review/hooks/use-soap-review.js";
import {
  ReviewErrorState,
  ReviewLoadingState,
} from "../../transcript-review/components/ReviewStateViews.jsx";
import { ConsultationToolbar } from "./ConsultationToolbar.jsx";
import { TranscriptPanel } from "./TranscriptPanel.jsx";
import {
  SOAPEditorPanel,
  SOAPEmptyPanel,
  SOAP_AVAILABLE_STATUSES,
} from "./SOAPPanel.jsx";

export function ConsultationWorkspace({
  sessionId,
  className,
  onApproved,
  showToolbar = true,
}) {
  const transcript = useTranscriptReview(sessionId);
  const sessionStatus = transcript.session?.status ?? "";
  const hasSoap = SOAP_AVAILABLE_STATUSES.has(sessionStatus);
  const soap = useSOAPReview(sessionId, { enabled: hasSoap && !transcript.loading });

  const readOnly = transcript.readOnly;
  const soapApproved =
    soap.readOnly ||
    sessionStatus === "SOAP_APPROVED" ||
    sessionStatus === "COMPLETED" ||
    sessionStatus === "READY_FOR_PRESCRIPTION";

  const canCompleteReview = !readOnly && sessionStatus === "REVIEWING";
  const canGenerateSOAP =
    !readOnly &&
    ["REVIEW_COMPLETED", "SOAP_READY", "SOAP_REVIEW_REQUIRED"].includes(sessionStatus);
  const canApproveSOAP = !soapApproved && sessionStatus === "SOAP_REVIEWING";
  const generatingSOAP =
    transcript.generatingSOAP || sessionStatus === "GENERATING_SOAP";

  const autosaveStatus = transcript.hasChanges
    ? transcript.autosaveStatus
    : soap.hasChanges
      ? soap.autosaveStatus
      : transcript.autosaveStatus;

  const handleSave = useCallback(async () => {
    if (transcript.hasChanges) await transcript.manualSave();
    if (soap.hasChanges) await soap.manualSave();
  }, [soap, transcript]);

  const handleCompleteReview = useCallback(async () => {
    await transcript.completeReview();
    await transcript.load();
  }, [transcript]);

  const handleGenerateSOAP = useCallback(async () => {
    await transcript.generateSOAP();
    await transcript.load();
  }, [transcript]);

  const handleApproveSOAP = useCallback(async () => {
    await soap.approve();
    onApproved?.();
  }, [onApproved, soap]);

  const handleRejectSOAP = useCallback(async () => {
    const reason = window.prompt("Enter rejection reason for this SOAP note:");
    if (!reason?.trim()) return;
    await soap.reject(reason.trim());
    await transcript.load();
  }, [soap, transcript]);

  if (transcript.loading) return <ReviewLoadingState />;
  if (transcript.error) {
    return <ReviewErrorState error={transcript.error} onRetry={transcript.load} />;
  }

  return (
    <section
      className={className}
      aria-label="Consultation workspace"
      data-testid="consultation-workspace"
    >
      {readOnly && (
        <p className="mb-3 text-sm text-muted-foreground rounded-lg border bg-muted/30 px-3 py-2">
          Archived consultation — read-only view.
        </p>
      )}

      {showToolbar && !readOnly && (
        <ConsultationToolbar
          sessionStatus={sessionStatus}
          transcriptDirty={transcript.hasChanges}
          soapDirty={soap.hasChanges}
          saving={transcript.saving || soap.saving}
          autosaveStatus={autosaveStatus}
          canCompleteReview={canCompleteReview}
          canGenerateSOAP={canGenerateSOAP}
          generatingSOAP={generatingSOAP}
          canApproveSOAP={canApproveSOAP}
          soapApproved={soapApproved}
          onSave={handleSave}
          onCompleteReview={handleCompleteReview}
          onGenerateSOAP={handleGenerateSOAP}
          onApproveSOAP={handleApproveSOAP}
          onRejectSOAP={handleRejectSOAP}
        />
      )}

      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <div className="grid min-h-[480px] lg:grid-cols-2 lg:min-h-[calc(100vh-220px)]">
          <TranscriptPanel
            segments={transcript.segments}
            dirty={transcript.dirty}
            readOnly={readOnly}
            saving={transcript.saving}
            sessionStatus={sessionStatus}
            onChange={transcript.updateSegment}
          />

          {hasSoap ? (
            <SOAPEditorPanel
              draft={soap.draft}
              dirty={soap.dirty}
              original={soap.original}
              readOnly={soapApproved}
              saving={soap.saving}
              loading={soap.loading}
              error={soap.error}
              onChange={soap.updateSection}
              onRetry={soap.load}
            />
          ) : (
            <SOAPEmptyPanel
              sessionStatus={sessionStatus}
              generating={generatingSOAP}
              canGenerate={canGenerateSOAP}
              onGenerate={handleGenerateSOAP}
            />
          )}
        </div>
      </div>
    </section>
  );
}
