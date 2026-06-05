"use client";

import { useCallback, useMemo } from "react";
import { useUser } from "@/hooks/use-user";
import { useTranscriptReview } from "../../transcript-review/hooks/use-transcript-review.js";
import { useSOAPReview } from "../../soap-review/hooks/use-soap-review.js";
import { usePatientForSession } from "../hooks/use-patient-for-session.js";
import {
  ReviewErrorState,
  ReviewLoadingState,
} from "../../transcript-review/components/ReviewStateViews.jsx";
import { ScribeSessionHeader, ScribeSessionFooter } from "./ScribeSessionHeader.jsx";
import { PatientSidebar } from "./PatientSidebar.jsx";
import { TranscriptPanel } from "./TranscriptPanel.jsx";
import {
  SOAPEditorPanel,
  SOAPEmptyPanel,
  SOAP_AVAILABLE_STATUSES,
  computeTranscriptConfidence,
} from "./SOAPPanel.jsx";
import { ConsultationToolbar } from "./ConsultationToolbar.jsx";

export function ConsultationWorkspace({
  sessionId,
  className,
  onApproved,
  onEndSession,
  showToolbar = true,
}) {
  const { displayName, specialization } = useUser();
  const transcript = useTranscriptReview(sessionId);
  const sessionStatus = transcript.session?.status ?? "";
  const hasSoap = SOAP_AVAILABLE_STATUSES.has(sessionStatus);
  const soap = useSOAPReview(sessionId, { enabled: hasSoap && !transcript.loading });
  const { patient } = usePatientForSession(transcript.session?.patient_id);

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

  const confidence = useMemo(
    () => computeTranscriptConfidence(transcript.segments),
    [transcript.segments],
  );

  const autosaveStatus = transcript.hasChanges
    ? transcript.autosaveStatus
    : soap.hasChanges
      ? soap.autosaveStatus
      : transcript.autosaveStatus;

  const statusLabel = soapApproved ? "Approved" : hasSoap ? "Draft" : "Review";

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

  const lastSaved = transcript.session?.updated_at
    ? new Date(transcript.session.updated_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div
      className={className}
      data-testid="consultation-workspace"
    >
      <section
        aria-label="Consultation workspace"
        className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
      >
        <ScribeSessionHeader
          doctorName={displayName}
          doctorSpecialty={specialization}
          onEndSession={onEndSession}
          endSessionLabel="End Session"
        />

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

        {readOnly && (
          <p className="shrink-0 text-xs text-muted-foreground border-b bg-muted/30 px-4 py-2">
            Archived consultation — read-only view.
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <PatientSidebar
            patient={patient}
            sessionDate={transcript.session?.created_at}
          />

          <TranscriptPanel
            segments={transcript.segments}
            dirty={transcript.dirty}
            readOnly={readOnly}
            saving={transcript.saving}
            sessionStatus={sessionStatus}
            onChange={transcript.updateSegment}
            mode="review"
          />

          {hasSoap ? (
            <SOAPEditorPanel
              draft={soap.draft}
              dirty={soap.dirty}
              readOnly={soapApproved}
              saving={soap.saving}
              loading={soap.loading}
              error={soap.error}
              onChange={soap.updateSection}
              onRetry={soap.load}
              confidence={confidence}
              onRegenerate={handleGenerateSOAP}
              onApprove={handleApproveSOAP}
              onSave={handleSave}
              canApprove={canApproveSOAP}
              generating={generatingSOAP}
              hasChanges={soap.hasChanges || transcript.hasChanges}
            />
          ) : (
            <SOAPEmptyPanel
              sessionStatus={sessionStatus}
              generating={generatingSOAP}
              canGenerate={canGenerateSOAP}
              onGenerate={handleGenerateSOAP}
              confidence={confidence}
            />
          )}
        </div>

        <ScribeSessionFooter
          sessionId={sessionId}
          lastSaved={lastSaved}
          statusLabel={statusLabel}
        />
      </section>
    </div>
  );
}
