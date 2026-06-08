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
import { ConsultationTimeline } from "./ConsultationTimeline.jsx";
import { isPoorTranscription } from "../lib/transcription-quality.js";
import { inferSoapSectionFromSegment } from "../lib/transcript-soap-link.js";
import { exportSoapAsPdf } from "../services/scribe-export.client.js";
import { useSessionStatus } from "../hooks/use-session-status.js";
import { useUnsavedGuard } from "../hooks/use-unsaved-guard.js";
import {
  isTranscriptWorkspaceAvailable,
  isTranscriptionPending,
} from "../lib/transcript-availability.js";

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
  onTranscriptionComplete,
  onStartTranscription,
  autoGenerateNote = true,
}) {
  const statusPoll = useSessionStatus(sessionId, { enabled: Boolean(sessionId), intervalMs: 1500 });

  const polledStatus = statusPoll.session?.status ?? "";
  const transcript = useTranscriptReview(sessionId, {
    enabled: isTranscriptWorkspaceAvailable(polledStatus),
  });
  const resolvedSessionStatus = polledStatus || transcript.session?.status || "";
  const transcriptionPending = isTranscriptionPending(resolvedSessionStatus);
  const waitingForTranscript = pipelineBusy || transcriptionPending;

  const hasSoap = SOAP_AVAILABLE_STATUSES.has(resolvedSessionStatus);
  const soap = useSOAPReview(sessionId, {
    enabled: hasSoap && !transcript.loading && !waitingForTranscript,
  });

  const readOnly = readOnlyProp ?? transcript.readOnly;
  const soapApproved =
    soap.readOnly ||
    resolvedSessionStatus === "SOAP_APPROVED" ||
    resolvedSessionStatus === "COMPLETED" ||
    resolvedSessionStatus === "READY_FOR_PRESCRIPTION";

  const canApproveSOAP = !soapApproved && resolvedSessionStatus === "SOAP_REVIEWING";
  const canRegenerateSOAP = !soapApproved && !readOnly && hasSoap;
  const canExportSOAP = hasSoap && !soap.loading;
  const generatingSOAP =
    transcript.generatingSOAP || soap.regenerating || resolvedSessionStatus === "GENERATING_SOAP";

  const [autoPipelineRunning, setAutoPipelineRunning] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeSegmentId, setActiveSegmentId] = useState(null);
  const [activeSoapSection, setActiveSoapSection] = useState(null);
  const [highlightedSoapSection, setHighlightedSoapSection] = useState(null);
  const audioSeekRef = useRef(null);
  const autoPipelineAttemptedRef = useRef(false);
  const autoTranscribeAttemptedRef = useRef(false);

  const poorTranscription = useMemo(
    () => {
      if (waitingForTranscript) return false;
      return isPoorTranscription({
        sessionStatus: resolvedSessionStatus,
        segments: transcript.segments,
        loadError: transcript.error,
        pipelineBusy: waitingForTranscript,
        loading: transcript.loading,
      });
    },
    [
      resolvedSessionStatus,
      transcript.segments,
      transcript.error,
      waitingForTranscript,
      transcript.loading,
    ],
  );

  const showDelete = Boolean(onDelete) && !readOnly && poorTranscription;
  const hasUnsavedChanges = transcript.hasChanges || soap.hasChanges;

  useUnsavedGuard(hasUnsavedChanges && !readOnly);

  useEffect(() => {
    autoTranscribeAttemptedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (readOnly || !onStartTranscription || !transcriptionPending || pipelineBusy) return;
    if (autoTranscribeAttemptedRef.current) return;
    autoTranscribeAttemptedRef.current = true;
    onStartTranscription(sessionId);
  }, [sessionId, transcriptionPending, readOnly, onStartTranscription, pipelineBusy]);

  useEffect(() => {
    if (!pipelineBusy) return;
    if (statusPoll.isTranscribed && isTranscriptWorkspaceAvailable(polledStatus)) {
      onTranscriptionComplete?.();
    } else if (statusPoll.isFailed) {
      onTranscriptionComplete?.();
    }
  }, [pipelineBusy, statusPoll.isTranscribed, statusPoll.isFailed, polledStatus, onTranscriptionComplete]);

  const handleSegmentClick = useCallback((segment) => {
    const section = inferSoapSectionFromSegment(segment);
    setActiveSegmentId(segment.id);
    setActiveSoapSection(section);
    setHighlightedSoapSection(section);
    audioSeekRef.current?.(segment.start_seconds ?? 0);
    document.getElementById(`soap-section-${section}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  const handleAudioTimeUpdate = useCallback((seconds) => {
    const match = transcript.segments.find(
      (s) => seconds >= (s.start_seconds ?? 0) && seconds < (s.end_seconds ?? Number.MAX_VALUE),
    );
    if (match) setActiveSegmentId(match.id);
  }, [transcript.segments]);

  const handleApproveSOAP = useCallback(async () => {
    await soap.approve();
    onApproved?.();
  }, [onApproved, soap]);

  const handleSaveSOAP = useCallback(async () => {
    await soap.manualSave();
  }, [soap]);

  const handleSaveTranscript = useCallback(async () => {
    await transcript.manualSave();
  }, [transcript]);

  const handleRejectSOAP = useCallback(async (reason) => {
    await soap.reject(reason);
    await transcript.load();
  }, [soap, transcript]);

  const handleRegenerateSOAP = useCallback(async () => {
    await soap.regenerate();
    await transcript.load();
  }, [soap, transcript]);

  const handleRestoreVersion = useCallback(async (versionId) => {
    if (!window.confirm("Restore this SOAP version? Current edits will be replaced.")) return;
    await soap.restoreVersion(versionId);
  }, [soap]);

  const handleExportSOAP = useCallback(async () => {
    setExporting(true);
    try {
      await exportSoapAsPdf(sessionId);
    } finally {
      setExporting(false);
    }
  }, [sessionId]);

  useEffect(() => {
    autoPipelineAttemptedRef.current = false;
    setAutoPipelineRunning(false);
  }, [sessionId]);

  useEffect(() => {
    if (!autoGenerateNote || readOnly || waitingForTranscript || transcript.loading || poorTranscription) return;
    if (autoPipelineAttemptedRef.current || autoPipelineRunning || generatingSOAP) return;

    const shouldCompleteAndGenerate =
      resolvedSessionStatus === "REVIEWING" && transcript.segments.length > 0;
    const shouldGenerateOnly =
      ["REVIEW_COMPLETED", "SOAP_READY", "SOAP_REVIEW_REQUIRED"].includes(resolvedSessionStatus);

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
        await soap.load();
      } catch {
        autoPipelineAttemptedRef.current = false;
      } finally {
        setAutoPipelineRunning(false);
      }
    })();
  }, [
    autoGenerateNote,
    readOnly,
    waitingForTranscript,
    resolvedSessionStatus,
    transcript.loading,
    transcript.segments.length,
    transcript.completeReview,
    transcript.generateSOAP,
    transcript.load,
    soap.load,
    autoPipelineRunning,
    generatingSOAP,
    poorTranscription,
  ]);

  const awaitingStatus = Boolean(sessionId) && !polledStatus && !transcript.session;
  const transcriptPipelineMessage = statusPoll.isFailed
    ? "Transcription failed. Tap Sessions → Transcribe to retry."
    : awaitingStatus
      ? "Loading session…"
      : waitingForTranscript
      ? resolvedSessionStatus === "TRANSCRIBING"
        ? "Transcribing audio…"
        : resolvedSessionStatus === "TRANSCRIPTION_QUEUED"
          ? "Starting transcription…"
          : pipelineMessage ?? "Transcribing…"
      : transcript.loading && !transcript.segments.length
        ? "Loading transcript…"
        : null;

  const transcriptLoadError = waitingForTranscript ? null : transcript.error;

  const noteGenerating = waitingForTranscript || autoPipelineRunning || generatingSOAP;

  const saveStatus = transcript.saving || soap.saving
    ? "saving"
    : transcript.autosaveStatus === "error" || soap.autosaveStatus === "error"
      ? "error"
      : !transcript.hasChanges && !soap.hasChanges &&
          (soap.autosaveStatus === "saved" || transcript.autosaveStatus === "saved")
        ? "saved"
        : hasUnsavedChanges
          ? "saving"
          : null;

  const soapReady = hasSoap && !soap.loading && !soap.error;
  const soapPanel = soapReady ? (
    <SOAPEditorPanel
      draft={soap.draft}
      dirty={soap.dirty}
      readOnly={soapApproved}
      saving={soap.saving}
      error={soap.error}
      versions={soap.versions}
      onChange={soap.updateSection}
      onRetry={soap.load}
      onSave={handleSaveSOAP}
      onApprove={handleApproveSOAP}
      onReject={handleRejectSOAP}
      onRegenerate={handleRegenerateSOAP}
      onRestoreVersion={handleRestoreVersion}
      onExport={handleExportSOAP}
      canApprove={canApproveSOAP}
      canExport={canExportSOAP}
      canRegenerate={canRegenerateSOAP}
      generating={noteGenerating}
      regenerating={soap.regenerating}
      exporting={exporting}
      autosaveStatus={soap.autosaveStatus}
      activeSection={activeSoapSection}
      onSectionFocus={setActiveSoapSection}
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
          <>
            <ScribeSessionHeader
              toolbarLeft={toolbarLeft}
              onEndSession={onEndSession}
              onOpenSessions={onOpenSessions}
              onDelete={showDelete ? onDelete : undefined}
              deleting={deleting}
              pipelineLabel={waitingForTranscript ? (pipelineMessage ?? "Transcribing…") : null}
              saveStatus={!waitingForTranscript ? saveStatus : null}
              hasUnsavedChanges={hasUnsavedChanges && !readOnly}
            />
            <ConsultationTimeline
              status={resolvedSessionStatus}
              processing={waitingForTranscript || noteGenerating}
            />
          </>
        }
      >
        <ScribeColumns
          recording={
            <TranscriptPanel
              sessionId={sessionId}
              segments={transcript.segments}
              dirty={transcript.dirty}
              readOnly={readOnly}
              saving={transcript.saving}
              hasChanges={transcript.hasChanges}
              autosaveStatus={transcript.autosaveStatus}
              sessionStatus={resolvedSessionStatus}
              onChange={transcript.updateSegment}
              onSave={handleSaveTranscript}
              mode="review"
              pipelineMessage={transcriptPipelineMessage}
              loadError={transcriptLoadError}
              onRetryLoad={transcript.load}
              poorTranscription={showDelete}
              onDelete={showDelete ? onDelete : undefined}
              deleting={deleting}
              activeSegmentId={activeSegmentId}
              onSegmentClick={handleSegmentClick}
              onAudioTimeUpdate={handleAudioTimeUpdate}
              onSeekReady={(fn) => { audioSeekRef.current = fn; }}
              highlightedSoapSection={highlightedSoapSection}
            />
          }
          soap={soapPanel}
        />
      </ScribeShell>
    </div>
  );
}
