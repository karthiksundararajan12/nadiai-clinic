"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranscriptReview } from "../../transcript-review/hooks/use-transcript-review.js";
import { useSOAPReview } from "../../soap-review/hooks/use-soap-review.js";
import { ScribeShell, ScribeColumns } from "./ScribeShell.jsx";
import { ScribeSessionHeader } from "./ScribeSessionHeader.jsx";
import { TranscriptPanel } from "./TranscriptPanel.jsx";
import {
  SOAPEditorPanel,
  SOAPEmptyPanel,
  SOAP_AVAILABLE_STATUSES,
} from "./SOAPPanel.jsx";
import { isPoorTranscription } from "../lib/transcription-quality.js";

export function ConsultationWorkspace({
  sessionId,
  onApproved,
  onEndSession,
  onOpenSessions,
  onDelete,
  deleting = false,
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

  const readOnly = readOnlyProp ?? transcript.readOnly;
  const soapApproved =
    soap.readOnly ||
    sessionStatus === "SOAP_APPROVED" ||
    sessionStatus === "COMPLETED" ||
    sessionStatus === "READY_FOR_PRESCRIPTION";

  const canApproveSOAP = !soapApproved && sessionStatus === "SOAP_REVIEWING";
  const generatingSOAP =
    transcript.generatingSOAP || sessionStatus === "GENERATING_SOAP";

  const [autoPipelineRunning, setAutoPipelineRunning] = useState(false);
  const autoPipelineAttemptedRef = useRef(false);

  const poorTranscription = useMemo(
    () =>
      isPoorTranscription({
        sessionStatus,
        segments: transcript.segments,
        loadError: transcript.error,
        pipelineBusy,
        loading: transcript.loading,
      }),
    [
      sessionStatus,
      transcript.segments,
      transcript.error,
      pipelineBusy,
      transcript.loading,
    ],
  );

  const showDelete = Boolean(onDelete) && !readOnly && poorTranscription;

  const handleApproveSOAP = useCallback(async () => {
    await soap.approve();
    onApproved?.();
  }, [onApproved, soap]);

  useEffect(() => {
    autoPipelineAttemptedRef.current = false;
    setAutoPipelineRunning(false);
  }, [sessionId]);

  useEffect(() => {
    if (!autoGenerateNote || readOnly || pipelineBusy || transcript.loading || poorTranscription) return;
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
    poorTranscription,
  ]);

  const transcriptPipelineMessage = pipelineBusy
    ? pipelineMessage
    : transcript.loading && !transcript.segments.length
      ? "Loading transcript…"
      : null;

  const noteGenerating = pipelineBusy || autoPipelineRunning || generatingSOAP;

  const soapReady = hasSoap && !soap.loading && !soap.error;
  const soapPanel = soapReady ? (
    <SOAPEditorPanel
      draft={soap.draft}
      dirty={soap.dirty}
      readOnly={soapApproved}
      saving={soap.saving}
      error={soap.error}
      onChange={soap.updateSection}
      onRetry={soap.load}
      onApprove={handleApproveSOAP}
      canApprove={canApproveSOAP}
      generating={noteGenerating}
      hasChanges={soap.hasChanges || transcript.hasChanges}
    />
  ) : (
    <SOAPEmptyPanel
      generating={noteGenerating || (hasSoap && soap.loading)}
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
            onDelete={showDelete ? onDelete : undefined}
            deleting={deleting}
          />
        }
      >
        <ScribeColumns
          recording={
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
              poorTranscription={showDelete}
              onDelete={showDelete ? onDelete : undefined}
              deleting={deleting}
            />
          }
          soap={soapPanel}
        />
      </ScribeShell>
    </div>
  );
}
