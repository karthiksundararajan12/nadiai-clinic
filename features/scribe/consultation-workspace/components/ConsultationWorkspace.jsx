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
import { resolveSoapDisplayDate, resolveSoapDateLabel } from "../lib/format-datetime.js";

const PRESCRIPTION_READY_STATUSES = new Set([
  "PRESCRIPTION_DRAFT_READY",
  "PRESCRIPTION_REVIEW_REQUIRED",
  "PRESCRIPTION_REVIEWING",
  "PRESCRIPTION_APPROVED",
  "COMPLETED",
]);

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
  onWorkspaceStateChange,
}) {
  const lastKnownStatusRef = useRef("");

  const pauseStatusPoll =
    Boolean(sessionId) &&
    !pipelineBusy &&
    ["SOAP_REVIEWING", "SOAP_APPROVED", "COMPLETED"].includes(lastKnownStatusRef.current);

  const statusPoll = useSessionStatus(sessionId, {
    enabled: Boolean(sessionId) && !pauseStatusPoll,
    intervalMs: 8000,
  });

  const polledStatus = statusPoll.session?.status ?? "";
  const statusForWorkspace = polledStatus || lastKnownStatusRef.current || "";

  const transcript = useTranscriptReview(sessionId, {
    enabled: isTranscriptWorkspaceAvailable(statusForWorkspace),
  });

  const resolvedSessionStatus =
    polledStatus || transcript.session?.status || lastKnownStatusRef.current || "";

  if (resolvedSessionStatus) {
    lastKnownStatusRef.current = resolvedSessionStatus;
  }

  const transcriptionPending = isTranscriptionPending(resolvedSessionStatus);
  const waitingForTranscript = pipelineBusy || transcriptionPending;

  const hasSoap = SOAP_AVAILABLE_STATUSES.has(resolvedSessionStatus);
  const soap = useSOAPReview(sessionId, {
    enabled: hasSoap && !waitingForTranscript,
  });

  const session = statusPoll.session ?? transcript.session ?? soap.session;
  const { patient: sessionPatient } = usePatientForSession(session?.patient_id);
  const patient = selectedPatient ?? sessionPatient;

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [approvalLocked, setApprovalLocked] = useState(false);
  const [approving, setApproving] = useState(false);
  const [generatingPrescription, setGeneratingPrescription] = useState(false);
  const [frozenQuality, setFrozenQuality] = useState(null);
  const frozenDateRef = useRef({ sessionId: null, value: null });
  const qualityDebounceRef = useRef(null);
  const qualityComputedRef = useRef(false);
  const soapDraftForQualityRef = useRef(soap.draft);
  soapDraftForQualityRef.current = soap.draft;
  const [icdOverride, setIcdOverride] = useState(null);
  const [rpmEnabled, setRpmEnabled] = useState(false);

  const readOnly = readOnlyProp ?? transcript.readOnly;
  const statusApproved =
    resolvedSessionStatus === "SOAP_APPROVED" ||
    resolvedSessionStatus === "COMPLETED" ||
    resolvedSessionStatus === "READY_FOR_PRESCRIPTION" ||
    resolvedSessionStatus === "GENERATING_PRESCRIPTION" ||
    resolvedSessionStatus === "PRESCRIPTION_DRAFT_READY" ||
    resolvedSessionStatus === "PRESCRIPTION_REVIEW_REQUIRED" ||
    resolvedSessionStatus === "PRESCRIPTION_REVIEWING" ||
    resolvedSessionStatus === "PRESCRIPTION_APPROVED";

  const soapApproved = approvalLocked || soap.readOnly || statusApproved;

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
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackAction, setFeedbackAction] = useState(null);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [manualEditMode, setManualEditMode] = useState(false);
  const pendingVersionIdRef = useRef(null);
  const audioSeekRef = useRef(null);
  const autoPipelineAttemptedRef = useRef(false);
  const autoTranscribeAttemptedRef = useRef(false);
  const parentTranscriptionRef = useRef(false);
  const prevPipelineBusyRef = useRef(false);
  const transcriptionCompleteHandledRef = useRef(false);

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
    transcriptionCompleteHandledRef.current = false;
    setApprovalLocked(false);
    setGeneratingPrescription(false);
    setFrozenQuality(null);
    qualityComputedRef.current = false;
    frozenDateRef.current = { sessionId, value: null };
    if (qualityDebounceRef.current) clearTimeout(qualityDebounceRef.current);
  }, [sessionId]);

  useEffect(() => {
    if (statusApproved && !approvalLocked) {
      setApprovalLocked(true);
    }
  }, [statusApproved, approvalLocked]);

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
    if (prevPipelineBusyRef.current && !pipelineBusy && sessionId) {
      void statusPoll.refresh();
    }
    prevPipelineBusyRef.current = pipelineBusy;
  }, [pipelineBusy, sessionId, statusPoll.refresh]);

  useEffect(() => {
    if (!statusPoll.isTranscribed && !statusPoll.isFailed) return;
    if (transcriptionCompleteHandledRef.current) return;
    transcriptionCompleteHandledRef.current = true;
    if (pipelineBusy) onTranscriptionComplete?.();
  }, [statusPoll.isTranscribed, statusPoll.isFailed, pipelineBusy, onTranscriptionComplete]);

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
    setApprovalLocked(true);
    try {
      await soap.approve();
      void statusPoll.refresh?.();
    } catch (err) {
      setApprovalLocked(false);
      window.alert(err instanceof Error ? err.message : "Failed to approve SOAP");
    } finally {
      setApproving(false);
    }
  }, [sessionId, soap, statusPoll]);

  const prescriptionReady = PRESCRIPTION_READY_STATUSES.has(resolvedSessionStatus);
  const prescriptionGenerating =
    generatingPrescription || resolvedSessionStatus === "GENERATING_PRESCRIPTION";
  const canGeneratePrescription =
    soapApproved && !prescriptionReady && !prescriptionGenerating;

  const handleGeneratePrescription = useCallback(async () => {
    setGeneratingPrescription(true);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}/prescription/generate`, {
        method: "POST",
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `Failed to generate prescription (${res.status})`);
      }
      await statusPoll.refresh?.();
      window.open(`/scribe?rx=${sessionId}`, "_blank");
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to generate prescription");
    } finally {
      setGeneratingPrescription(false);
    }
  }, [sessionId, statusPoll]);

  const handleViewPrescription = useCallback(() => {
    window.open(`/scribe?rx=${sessionId}`, "_blank");
  }, [sessionId]);

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

  const handleOpenSoapReview = useCallback(() => {
    setReviewModalOpen(true);
  }, []);

  const handleRegenerateFromReview = useCallback(async () => {
    setReviewModalOpen(false);
    try {
      const result = await soap.regenerate();
      pendingVersionIdRef.current = result?.version?.id ?? null;
      setFeedbackAction("regenerated");
      setFeedbackModalOpen(true);
      void statusPoll.refresh?.();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to regenerate SOAP note");
    }
  }, [soap, statusPoll]);

  const handleEditManuallyFromReview = useCallback(() => {
    setReviewModalOpen(false);
    setManualEditMode(true);
  }, []);

  const handleCancelManualEdit = useCallback(async () => {
    setManualEditMode(false);
    await soap.load({ silent: true });
  }, [soap]);

  const handleSaveManualEdits = useCallback(async () => {
    try {
      const result = await soap.saveDoctorEdits({
        subjective: soap.draft.subjective ?? "",
        objective: soap.draft.objective ?? "",
        assessment: soap.draft.assessment ?? "",
        plan: soap.draft.plan ?? "",
      });
      setManualEditMode(false);
      pendingVersionIdRef.current = result?.version?.id ?? null;
      setFeedbackAction("manual_edit");
      setFeedbackModalOpen(true);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to save SOAP edits");
    }
  }, [soap]);

  const handleSubmitFeedback = useCallback(async ({ feedback_reasons, other_reason }) => {
    if (!feedbackAction) {
      setFeedbackModalOpen(false);
      return;
    }
    setFeedbackSubmitting(true);
    try {
      if ((feedback_reasons?.length ?? 0) > 0 || other_reason) {
        await soap.submitReviewFeedback({
          review_action: feedbackAction,
          feedback_reasons: feedback_reasons ?? [],
          other_reason,
          soap_version_id: pendingVersionIdRef.current ?? undefined,
        });
      }
      setFeedbackModalOpen(false);
      setFeedbackAction(null);
      pendingVersionIdRef.current = null;
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [feedbackAction, soap]);

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
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [sessionId]);

  const sessionComplete = soapApproved;

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
        // Do not reset — avoids infinite auto-generate retry loop on API errors.
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

  useEffect(() => {
    const hideSegments = waitingForTranscript && transcript.segments.length === 0;
    onWorkspaceStateChange?.({
      segments: hideSegments ? [] : transcript.segments,
      transcriptLoading: !soapApproved && (waitingForTranscript || (transcript.loading && !transcript.segments.length)),
      transcriptLoadingMessage: transcriptPipelineMessage ?? pipelineMessage,
      sessionComplete,
      status: resolvedSessionStatus,
    });
  }, [
    onWorkspaceStateChange,
    transcript.segments,
    waitingForTranscript,
    transcript.loading,
    transcriptPipelineMessage,
    pipelineMessage,
    sessionComplete,
    resolvedSessionStatus,
    soapApproved,
  ]);

  const transcriptLoadError = waitingForTranscript ? null : transcript.error;

  const noteGenerating = !soapApproved && (waitingForTranscript || autoPipelineRunning || generatingSOAP);

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

  const hasDraftContent = useMemo(
    () => Object.values(soap.draft ?? {}).some((v) => String(v ?? "").trim()),
    [soap.draft],
  );

  const soapReady =
    soapApproved ||
    approving ||
    (hasSoap && hasDraftContent && !soap.error);
  const soapWarnings = useMemo(() => getSoapClinicalWarnings(soap.draft), [soap.draft]);
  const blockingApproval = hasBlockingSoapWarnings(soapWarnings);

  const summary = useMemo(() => buildConsultationSummary(soap.draft), [soap.draft]);
  const evidenceMap = useMemo(
    () => buildSoapEvidenceMap(transcript.segments),
    [transcript.segments],
  );
  const qualityBusy =
    soapApproved ||
    noteGenerating ||
    soap.regenerating ||
    soap.loading ||
    !hasSoap;

  useEffect(() => {
    if (qualityBusy) {
      if (qualityDebounceRef.current) clearTimeout(qualityDebounceRef.current);
      if (soapApproved) {
        setFrozenQuality(null);
        qualityComputedRef.current = false;
      }
      return;
    }

    if (qualityComputedRef.current) return;

    if (qualityDebounceRef.current) clearTimeout(qualityDebounceRef.current);
    qualityDebounceRef.current = setTimeout(() => {
      const computed = computeSoapQuality(soapDraftForQualityRef.current, transcript.segments);
      if (computed) {
        setFrozenQuality(computed);
        qualityComputedRef.current = true;
      }
    }, 600);

    return () => {
      if (qualityDebounceRef.current) clearTimeout(qualityDebounceRef.current);
    };
  }, [qualityBusy, soapApproved, transcript.segments]);

  useEffect(() => {
    if (soap.regenerating) {
      setFrozenQuality(null);
      qualityComputedRef.current = false;
    }
  }, [soap.regenerating]);

  const quality = soapApproved ? null : frozenQuality;

  const soapDisplayCandidate = resolveSoapDisplayDate({
    note: soap.note,
    session,
    isApproved: soapApproved,
  });
  if (frozenDateRef.current.sessionId !== sessionId) {
    frozenDateRef.current = { sessionId, value: null };
  }
  if (soapDisplayCandidate && !frozenDateRef.current.value) {
    frozenDateRef.current.value = soapDisplayCandidate;
  }
  if (soapApproved && soap.note?.approved_at) {
    frozenDateRef.current.value = soap.note.approved_at;
  }
  const soapDisplayDate = frozenDateRef.current.value ?? soapDisplayCandidate;
  const soapDateLabel = resolveSoapDateLabel(soapApproved);
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

  if (waitingForTranscript) {
    return (
      <div className="h-full min-h-0">
        <TranscriptionPendingView
          message={transcriptPipelineMessage ?? pipelineMessage ?? "Transcribing…"}
          onOpenSessions={onOpenSessions}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <ConsultationClinicalLayout
        sessionId={sessionId}
        sessionDate={soapDisplayDate}
        sessionDateLabel={soapDateLabel}
        status={resolvedSessionStatus}
        quality={quality}
        evidenceMap={evidenceMap}
        readOnly={readOnly || soapApproved}
        soapApproved={soapApproved}
        toolbarLeft={toolbarLeft}
        onOpenSessions={onOpenSessions}
        onEvidenceJump={handlePlayFromHere}
        versions={soap.versions}
        onRestoreVersion={handleRestoreVersion}
        onCompareVersions={handleCompareVersions}
        versionsOpen={versionsOpen}
        onVersionsOpenChange={setVersionsOpen}
        auditOpen={auditOpen}
        onAuditOpenChange={setAuditOpen}
        canApprove={canApproveSOAP && !blockingApproval && !manualEditMode}
        approving={approving}
        onApprove={handleApproveSOAP}
        onExport={handleExportSOAP}
        exporting={exporting}
        onOpenVersions={() => setVersionsOpen(true)}
        onOpenAudit={() => setAuditOpen(true)}
        onOpenSoapReview={handleOpenSoapReview}
        reviewModalOpen={reviewModalOpen}
        onReviewModalOpenChange={setReviewModalOpen}
        onRegenerateFromReview={handleRegenerateFromReview}
        onEditManuallyFromReview={handleEditManuallyFromReview}
        manualEditMode={manualEditMode}
        onSaveManualEdits={handleSaveManualEdits}
        onCancelManualEdit={handleCancelManualEdit}
        feedbackModalOpen={feedbackModalOpen}
        onFeedbackModalOpenChange={setFeedbackModalOpen}
        onSubmitFeedback={handleSubmitFeedback}
        feedbackSubmitting={feedbackSubmitting}
        soapNote={soap.note}
        soapNoteStatus={soap.note?.status}
        soapDoctorEditedAt={soap.note?.doctor_edited_at}
        canGeneratePrescription={canGeneratePrescription}
        generatingPrescription={prescriptionGenerating}
        onGeneratePrescription={handleGeneratePrescription}
        prescriptionReady={prescriptionReady}
        onViewPrescription={handleViewPrescription}
        soapProps={{
          ready: soapReady,
          panel: {
            draft: soap.draft,
            dirty: soap.dirty,
            readOnly: soapApproved,
            saving: soap.saving,
            error: soap.error,
            generating: soapApproved ? false : noteGenerating,
            regenerating: soapApproved ? false : soap.regenerating,
            activeSection: activeSoapSection ?? highlightedSoapSection,
            onChange: soap.updateSection,
            onRetry: soap.load,
            onSectionFocus: setActiveSoapSection,
            onRegenerate: handleRegenerateSOAP,
          },
          empty: {
            generating:
              soapApproved || approving || hasDraftContent
                ? false
                : noteGenerating || (hasSoap && soap.loading),
            error: soap.error,
            onRetry: soap.load,
          },
        }}
      />
    </div>
  );
}
