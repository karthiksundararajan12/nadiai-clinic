"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranscriptReview } from "../../transcript-review/hooks/use-transcript-review.js";
import { useSOAPReview } from "../../soap-review/hooks/use-soap-review.js";
import { usePatientForSession } from "../hooks/use-patient-for-session.js";
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
  toolbarLeft,
  readOnly: readOnlyProp,
  pipelineBusy = false,
  pipelineMessage = null,
  autoGenerateNote = true,
}) {
  const transcript = useTranscriptReview(sessionId, { enabled: !pipelineBusy });
  const sessionStatus = transcript.session?.status ?? "";
  const hasSoap = SOAP_AVAILABLE_STATUSES.has(sessionStatus);
  const soap = useSOAPReview(sessionId, { enabled: hasSoap && !transcript.loading && !pipelineBusy });
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

  const [autoPipelineRunning, setAutoPipelineRunning] = useState(false);
  const [autoPipelineFailed, setAutoPipelineFailed] = useState(false);
  const autoPipelineAttemptedRef = useRef(false);

  const confidence = useMemo(
    () => computeTranscriptConfidence(transcript.segments),
    [transcript.segments],
  );

  const statusLabel = soapApproved ? "Approved" : hasSoap ? "Draft" : pipelineBusy ? "Processing" : "In review";

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

  useEffect(() => {
    autoPipelineAttemptedRef.current = false;
    setAutoPipelineRunning(false);
    setAutoPipelineFailed(false);
  }, [sessionId]);

  useEffect(() => {
    if (!autoGenerateNote || readOnly || pipelineBusy || transcript.loading) return;
    if (autoPipelineAttemptedRef.current || autoPipelineRunning || generatingSOAP) return;

    const shouldCompleteAndGenerate =
      sessionStatus === "REVIEWING" && transcript.segments.length > 0;
    const shouldGenerateOnly =
      ["REVIEW_COMPLETED", "SOAP_READY", "SOAP_REVIEW_REQUIRED"].includes(sessionStatus);

    if (!shouldCompleteAndGenerate && !shouldGenerateOnly) return;

    autoPipelineAttemptedRef.current = true;
    setAutoPipelineRunning(true);

    (async () => {
      try {
        if (shouldCompleteAndGenerate) {
          await transcript.completeReview();
          await transcript.load();
        }
        await transcript.generateSOAP();
      } catch {
        autoPipelineAttemptedRef.current = false;
        setAutoPipelineFailed(true);
      } finally {
        setAutoPipelineRunning(false);
      }
    })();
  }, [
    autoGenerateNote,
    readOnly,
    pipelineBusy,
    sessionStatus,
    transcript.loading,
    transcript.segments.length,
    transcript.completeReview,
    transcript.generateSOAP,
    transcript.load,
    autoPipelineRunning,
    generatingSOAP,
  ]);

  const transcriptPipelineMessage = pipelineBusy
    ? pipelineMessage
    : transcript.loading && !transcript.segments.length
      ? "Loading transcript…"
      : null;

  const noteGenerating = pipelineBusy || autoPipelineRunning || generatingSOAP;

  const lastSaved = transcript.session?.updated_at
    ? new Date(transcript.session.updated_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const soapReady = hasSoap && !soap.loading && !soap.error;
  const notePanel = soapReady ? (
    <SOAPEditorPanel
      draft={soap.draft}
      dirty={soap.dirty}
      readOnly={soapApproved}
      saving={soap.saving}
      loading={false}
      error={soap.error}
      onChange={soap.updateSection}
      onRetry={soap.load}
      confidence={confidence}
      onRegenerate={handleGenerateSOAP}
      onApprove={handleApproveSOAP}
      onSave={handleSave}
      canApprove={canApproveSOAP}
      generating={noteGenerating}
      hasChanges={soap.hasChanges || transcript.hasChanges}
    />
  ) : (
    <SOAPEmptyPanel
      sessionStatus={sessionStatus}
      generating={noteGenerating || (hasSoap && soap.loading)}
      canGenerate={(!autoGenerateNote || autoPipelineFailed) && canGenerateSOAP}
      onGenerate={handleGenerateSOAP}
      confidence={confidence}
      onCompleteReview={handleCompleteReview}
      canCompleteReview={(!autoGenerateNote || autoPipelineFailed) && canCompleteReview}
      completeReviewDisabled={transcript.saving || transcript.hasChanges || generatingSOAP}
      error={soap.error}
      onRetry={soap.load}
    />
  );

  return (
    <div className="h-full min-h-0" data-testid="consultation-workspace">
      <ScribeShell
        header={
          <ScribeSessionHeader
            toolbarLeft={toolbarLeft}
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
              pipelineMessage={transcriptPipelineMessage}
              loadError={transcript.error}
              onRetryLoad={transcript.load}
            />
          }
          note={notePanel}
        />
      </ScribeShell>
    </div>
  );
}
