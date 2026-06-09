"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranscriptReview } from "../../transcript-review/hooks/use-transcript-review.js";
import { useSOAPReview } from "../../soap-review/hooks/use-soap-review.js";
import { SOAP_AVAILABLE_STATUSES } from "../lib/soap-availability.js";
import { ConsultationClinicalLayout } from "./clinical/ConsultationClinicalLayout.jsx";
import { TranscriptionPendingView } from "./clinical/TranscriptionPendingView.jsx";
import { isPoorTranscription } from "../lib/transcription-quality.js";
import { inferSoapSectionFromSegment } from "../lib/transcript-soap-link.js";
import { exportSoapAsPdf } from "../services/scribe-export.client.js";
import { useSessionStatus } from "../hooks/use-session-status.js";
import { usePatientForSession } from "../hooks/use-patient-for-session.js";
import { useUnsavedGuard } from "../hooks/use-unsaved-guard.js";
import {
  isTranscriptWorkspaceAvailable,
  isTranscriptionPending,
} from "../lib/transcript-availability.js";
import { buildConsultationSummary } from "../lib/consultation-summary.js";
import { buildSoapEvidenceMap } from "../lib/soap-evidence.js";
import { computeSoapQuality } from "../lib/soap-quality.js";
import { buildProductivityMetrics } from "../lib/productivity-metrics.js";
import { getSoapClinicalWarnings, hasBlockingSoapWarnings } from "../lib/clinical-safety.js";
import { deriveClinicalInsights } from "../lib/clinical-insights.js";
import { attachPatientToSession } from "../services/patient.client.js";

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
  selectedPatient,
  onSelectedPatientChange,
  onFooterProps,
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

  const session = statusPoll.session ?? transcript.session;
  const { patient: sessionPatient } = usePatientForSession(session?.patient_id);
  const patient = selectedPatient ?? sessionPatient;

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [approveBannerOpen, setApproveBannerOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [icdOverride, setIcdOverride] = useState(null);
  const [rpmEnabled, setRpmEnabled] = useState(false);

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
  const parentTranscriptionRef = useRef(false);

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
    parentTranscriptionRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (pipelineBusy || pipelineMessage) {
      parentTranscriptionRef.current = true;
    }
  }, [pipelineBusy, pipelineMessage]);

  useEffect(() => {
    if (readOnly || !onStartTranscription || !transcriptionPending || pipelineBusy || pipelineMessage) return;
    if (autoTranscribeAttemptedRef.current || parentTranscriptionRef.current) return;
    autoTranscribeAttemptedRef.current = true;
    onStartTranscription(sessionId);
  }, [
    sessionId,
    transcriptionPending,
    readOnly,
    onStartTranscription,
    pipelineBusy,
    pipelineMessage,
  ]);

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

  const handlePlayFromHere = useCallback((segment) => {
    audioSeekRef.current?.(segment.start_seconds ?? 0, true);
    handleSegmentClick(segment);
  }, [handleSegmentClick]);

  const handleAudioTimeUpdate = useCallback((seconds) => {
    const match = transcript.segments.find(
      (s) => seconds >= (s.start_seconds ?? 0) && seconds < (s.end_seconds ?? Number.MAX_VALUE),
    );
    if (match) setActiveSegmentId(match.id);
  }, [transcript.segments]);

  const handleSeekReady = useCallback((fn) => {
    audioSeekRef.current = fn;
  }, []);

  const handleApproveSOAP = useCallback(async () => {
    setApproving(true);
    try {
      await soap.approve();
      setApproveBannerOpen(true);
      void fetch(`/api/scribe/sessions/${sessionId}/prescription/generate`, { method: "POST" }).catch(() => {});
      await statusPoll.refresh?.();
    } finally {
      setApproving(false);
    }
  }, [sessionId, soap, statusPoll]);

  const handlePatientSelect = useCallback(async (p) => {
    onSelectedPatientChange?.(p);
    if (sessionId && p?.id) {
      try { await attachPatientToSession(sessionId, p.id); } catch { /* non-blocking */ }
    }
  }, [sessionId, onSelectedPatientChange]);

  const handleRpmToggle = useCallback((enabled) => {
    setRpmEnabled(enabled);
    if (enabled) {
      const tag = "[RPM:ON] Remote monitoring enabled. First check-in in 24 hours.";
      const current = soap.draft.clinicalSummary ?? "";
      if (!current.includes("[RPM:ON]")) {
        soap.updateSection("clinicalSummary", `${tag}\n${current}`.trim());
      }
    }
  }, [soap]);

  const handleSaveDraft = useCallback(async () => {
    if (transcript.hasChanges) await transcript.manualSave();
    if (soap.hasChanges) await soap.manualSave();
  }, [transcript, soap]);

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

  const handleCompareVersions = useCallback(async (fromVersionId, toVersionId) => {
    const comparison = await soap.compare(fromVersionId, toVersionId);
    const diff = comparison?.diff ?? comparison?.changes ?? comparison?.sections;
    if (Array.isArray(diff) && diff.length > 0) {
      window.alert(
        diff
          .map((item) => {
            const key = item.section ?? item.key ?? "section";
            return `${key}: updated`;
          })
          .join("\n"),
      );
      return;
    }
    window.alert("No differences found between selected versions.");
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
  const soapWarnings = useMemo(() => getSoapClinicalWarnings(soap.draft), [soap.draft]);
  const blockingApproval = hasBlockingSoapWarnings(soapWarnings);

  const summary = useMemo(() => buildConsultationSummary(soap.draft), [soap.draft]);
  const evidenceMap = useMemo(
    () => buildSoapEvidenceMap(transcript.segments),
    [transcript.segments],
  );
  const quality = useMemo(
    () => computeSoapQuality(soap.draft, transcript.segments),
    [soap.draft, transcript.segments],
  );
  const metrics = useMemo(
    () => buildProductivityMetrics(session, soap.note),
    [session, soap.note],
  );

  const insights = useMemo(
    () => deriveClinicalInsights(soap.draft, soap.note),
    [soap.draft, soap.note],
  );

  const summaryHandlers = useMemo(() => ({
    onUpdateChiefComplaint: (v) => {
      soap.updateSection("chiefComplaint", v);
      soap.updateSection("subjective", v);
    },
    onUpdateDuration: (v) => {
      const hpi = soap.draft.historyOfPresentIllness ?? soap.draft.subjective ?? "";
      soap.updateSection("historyOfPresentIllness", `${v}\n${hpi}`.trim());
    },
    onUpdateSymptoms: (symptoms) => {
      soap.updateSection("historyOfPresentIllness", symptoms.map((s) => `• ${s}`).join("\n"));
    },
    onUpdateKeyFindings: (findings) => {
      soap.updateSection("objective", findings.filter(Boolean).join("\n"));
    },
  }), [soap]);

  useEffect(() => {
    onFooterProps?.({
      patient,
      canApprove: canApproveSOAP && !blockingApproval,
      approving,
      onApprove: handleApproveSOAP,
      onExport: handleExportSOAP,
      exporting,
      onOpenVersions: () => setVersionsOpen(true),
      onOpenAudit: () => setAuditOpen(true),
      onReject: handleRejectSOAP,
    });
  }, [
    onFooterProps, patient, canApproveSOAP, blockingApproval,
    approving, handleApproveSOAP, handleExportSOAP,
    exporting, handleRejectSOAP,
  ]);

  if (waitingForTranscript) {
    return (
      <div className="h-full min-h-0">
        <TranscriptionPendingView
          patient={patient}
          sessionDate={session?.created_at}
          status={resolvedSessionStatus}
          message={transcriptPipelineMessage ?? pipelineMessage ?? "Transcribing…"}
          toolbarLeft={toolbarLeft}
          onOpenSessions={onOpenSessions}
          onEndSession={onEndSession}
          pipelineLabel={pipelineMessage ?? "Transcribing…"}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <ConsultationClinicalLayout
        sessionId={sessionId}
        patient={patient}
        onPatientSelect={handlePatientSelect}
        onPatientClear={() => onSelectedPatientChange?.(null)}
        sessionDate={session?.created_at}
        status={resolvedSessionStatus}
        summary={summary}
        summaryHandlers={summaryHandlers}
        metrics={metrics}
        quality={quality}
        insights={insights}
        icdOverride={icdOverride}
        onIcdOverride={setIcdOverride}
        rpmEnabled={rpmEnabled}
        onRpmToggle={handleRpmToggle}
        evidenceMap={evidenceMap}
        readOnly={readOnly || soapApproved}
        toolbarLeft={toolbarLeft}
        onOpenSessions={onOpenSessions}
        transcriptSegments={transcript.segments}
        transcriptReadOnly={readOnly}
        transcriptSaving={transcript.saving}
        transcriptRegenerating={soap.regenerating}
        onTranscriptRegenerate={handleRegenerateSOAP}
        onEvidenceJump={handlePlayFromHere}
        versions={soap.versions}
        onRestoreVersion={handleRestoreVersion}
        onCompareVersions={handleCompareVersions}
        versionsOpen={versionsOpen}
        onVersionsOpenChange={setVersionsOpen}
        auditOpen={auditOpen}
        onAuditOpenChange={setAuditOpen}
        approveBanner={{
          open: approveBannerOpen,
          onViewPrescription: () => window.open(`/scribe?rx=${sessionId}`, "_blank"),
          onSkip: () => { setApproveBannerOpen(false); onApproved?.(); },
          onDismiss: () => setApproveBannerOpen(false),
        }}
        soapProps={{
          ready: soapReady,
          panel: {
            draft: soap.draft,
            dirty: soap.dirty,
            readOnly: soapApproved,
            saving: soap.saving,
            error: soap.error,
            generating: noteGenerating,
            regenerating: soap.regenerating,
            activeSection: activeSoapSection ?? highlightedSoapSection,
            onChange: soap.updateSection,
            onRetry: soap.load,
            onSectionFocus: setActiveSoapSection,
            onRegenerate: handleRegenerateSOAP,
          },
          empty: {
            generating: noteGenerating || (hasSoap && soap.loading),
            error: soap.error,
            onRetry: soap.load,
          },
        }}
      />
    </div>
  );
}
