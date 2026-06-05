"use client";

import { useCallback, useMemo } from "react";
import { useTranscriptReview } from "../../transcript-review/hooks/use-transcript-review.js";
import { useSOAPReview } from "../../soap-review/hooks/use-soap-review.js";
import { usePatientForSession } from "../hooks/use-patient-for-session.js";
import {
  ReviewErrorState,
  ReviewLoadingState,
} from "../../transcript-review/components/ReviewStateViews.jsx";
import { ScribeShell, ScribeColumns } from "./ScribeShell.jsx";
import { ScribeSessionHeader, ScribeSessionFooter } from "./ScribeSessionHeader.jsx";
import { PatientSidebar } from "./PatientSidebar.jsx";
import { TranscriptPanel } from "./TranscriptPanel.jsx";
import {
  SOAPEditorPanel,
  SOAPEmptyPanel,
  SOAP_AVAILABLE_STATUSES,
  computeTranscriptConfidence,
} from "./SOAPPanel.jsx";

export function ConsultationWorkspace({
  sessionId,
  onApproved,
  onEndSession,
  onOpenSessions,
  readOnly: readOnlyProp,
}) {
  const transcript = useTranscriptReview(sessionId);
  const sessionStatus = transcript.session?.status ?? "";
  const hasSoap = SOAP_AVAILABLE_STATUSES.has(sessionStatus);
  const soap = useSOAPReview(sessionId, { enabled: hasSoap && !transcript.loading });
  const { patient } = usePatientForSession(transcript.session?.patient_id);

  const readOnly = readOnlyProp ?? transcript.readOnly;
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

  const statusLabel = soapApproved ? "Approved" : hasSoap ? "Draft" : "In review";

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

  if (transcript.loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50">
        <ReviewLoadingState />
      </div>
    );
  }

  if (transcript.error) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-slate-50 p-6">
        <ReviewErrorState error={transcript.error} onRetry={transcript.load} />
      </div>
    );
  }

  const lastSaved = transcript.session?.updated_at
    ? new Date(transcript.session.updated_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const notePanel = hasSoap ? (
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
      onCompleteReview={handleCompleteReview}
      canCompleteReview={canCompleteReview}
      completeReviewDisabled={transcript.saving || transcript.hasChanges || generatingSOAP}
    />
  );

  return (
    <div data-testid="consultation-workspace">
      <ScribeShell
        header={
          <ScribeSessionHeader
            onEndSession={onEndSession}
            onOpenSessions={onOpenSessions}
          />
        }
        footer={
          <ScribeSessionFooter
            sessionId={sessionId}
            lastSaved={lastSaved}
            statusLabel={statusLabel}
          />
        }
      >
        <ScribeColumns
          patient={
            <PatientSidebar
              patient={patient}
              sessionDate={transcript.session?.created_at}
            />
          }
          transcript={
            <TranscriptPanel
              segments={transcript.segments}
              dirty={transcript.dirty}
              readOnly={readOnly}
              saving={transcript.saving}
              sessionStatus={sessionStatus}
              onChange={transcript.updateSegment}
              mode="review"
            />
          }
          note={notePanel}
        />
      </ScribeShell>
    </div>
  );
}
