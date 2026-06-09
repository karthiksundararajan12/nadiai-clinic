"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { uploadCompletedRecording } from "@/features/scribe/upload/audio-upload.client.js";
import { useRecording } from "@/features/scribe/recording/use-recording.js";
import { ConsultationWorkspace } from "@/features/scribe/consultation-workspace";
import { SessionsDrawer } from "@/features/scribe/consultation-workspace/components/SessionsDrawer.jsx";
import { RecordingEngine } from "@/features/scribe/consultation-workspace/components/consultation/RecordingEngine.jsx";
import { PatientSelector } from "@/features/scribe/consultation-workspace/components/consultation/PatientSelector.jsx";
import { Button } from "@/components/ui/button";
import { ACTIVE_CONSULTATION_STATUSES } from "@/features/scribe";
import { logSessionEvent } from "@/features/scribe/consultation-workspace/services/scribe-export.client.js";

const TRANSCRIBE_TIMEOUT_MS = 5 * 60 * 1000;

const TRANSCRIBED_STATUSES = new Set([
  "TRANSCRIBED",
  "REVIEWING",
  "REVIEW_COMPLETED",
  "GENERATING_SOAP",
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
]);

async function runTranscriptionPipeline(sessionId, signal) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}/transcription/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Transcription failed (${res.status})`);
  }
  return payload;
}

async function fetchConsultations(bucket) {
  const res = await fetch(
    `/api/scribe/consultations/history?bucket=${bucket}&limit=50&sort_order=desc`,
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `Failed to load consultations (${res.status})`);
  return payload?.data ?? [];
}

export function ScribeWorkflow() {
  const [language, setLanguage] = useState("english");
  const [view, setView] = useState("live");
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [viewFromHistory, setViewFromHistory] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [footerProps, setFooterProps] = useState({});

  const [activeSessions, setActiveSessions] = useState([]);
  const [historySessions, setHistorySessions] = useState([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(null);

  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [busySessionId, setBusySessionId] = useState(null);
  const [lastRecordedSessionId, setLastRecordedSessionId] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const recording = useRecording({
    chunkIntervalMs: 5_000,
    onError: (err) => setUploadError(err instanceof Error ? err : new Error(String(err))),
  });

  const loadConsultations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setInitialLoad(true);
    setListError(null);

    try {
      const [active, history] = await Promise.all([
        fetchConsultations("active"),
        fetchConsultations("history"),
      ]);
      if (mountedRef.current) {
        setActiveSessions(active);
        setHistorySessions(history);
      }
    } catch (err) {
      if (mountedRef.current) setListError(err);
    } finally {
      if (mountedRef.current) {
        setInitialLoad(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadConsultations(false);
  }, [loadConsultations]);

  const runTranscription = useCallback(async (sessionId) => {
    setPipelineBusy(true);
    setPipelineMessage("Transcribing…");
    setBusySessionId(sessionId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

    try {
      const payload = await runTranscriptionPipeline(sessionId, controller.signal);
      await loadConsultations(true);
      const status = payload?.session?.status ?? payload?.status;
      if (TRANSCRIBED_STATUSES.has(status)) {
        setViewFromHistory(false);
        setActiveSessionId(sessionId);
        setView("consultation");
        setSessionsOpen(false);
      }
      return payload;
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Transcription timed out."
          : err instanceof Error
            ? err.message
            : "Transcription failed";
      setListError(new Error(message));
    } finally {
      clearTimeout(timeout);
      setBusySessionId(null);
      if (mountedRef.current) {
        setPipelineBusy(false);
        setPipelineMessage(null);
      }
    }
  }, [loadConsultations]);

  const handleRecordingComplete = useCallback(async (chunks, mimeType, durationSeconds) => {
    if (!chunks?.length) {
      setUploadError(new Error("No audio captured. Allow microphone access and try again."));
      return;
    }

    setUploadError(null);
    setPipelineBusy(true);
    setPipelineMessage("Uploading audio…");

    try {
      const audioDurationSeconds = Math.max(1, durationSeconds || 30);
      const finalized = await uploadCompletedRecording({
        chunks,
        audioDurationSeconds,
        language,
        patientId: selectedPatient?.id,
        onProgress: (event) => {
          if (event.phase === "uploading") {
            setPipelineMessage(`Uploading… ${event.progress ?? 0}%`);
          } else if (event.phase === "finalizing") {
            setPipelineMessage("Finalizing upload…");
          }
        },
      });

      const sessionId = finalized?.session?.id ?? finalized?.id;
      if (!sessionId) throw new Error("Upload finished but no session id was returned");

      setLastRecordedSessionId(sessionId);
      setActiveSessionId(sessionId);
      setViewFromHistory(false);
      setView("consultation");
      setPipelineMessage("Transcribing…");

      void logSessionEvent(sessionId, "recording_started", {}).catch(() => {});
      void logSessionEvent(sessionId, "recording_stopped", {
        duration_seconds: audioDurationSeconds,
      }).catch(() => {});

      void runTranscription(sessionId);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (err && typeof err === "object" && "code" in err) wrapped.code = err.code;
      setUploadError(wrapped);
      setView("live");
      setPipelineBusy(false);
      setPipelineMessage(null);
    }
  }, [language, runTranscription, selectedPatient?.id]);

  const handleStopRecording = useCallback(async () => {
    try {
      const chunks = await recording.stopRecording();
      await handleRecordingComplete(chunks, recording.mimeType, recording.duration);
    } catch (err) {
      setUploadError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [handleRecordingComplete, recording]);

  const recordState = useMemo(() => {
    if (pipelineBusy) return "processing";
    if (recording.isRecording || recording.isPaused) return "recording";
    return "idle";
  }, [pipelineBusy, recording.isRecording, recording.isPaused]);

  const goLive = useCallback(() => {
    setView("live");
    setActiveSessionId(null);
    setViewFromHistory(false);
    setUploadError(null);
    setSessionsOpen(false);
    setFooterProps({});
  }, []);

  const openSession = useCallback((sessionId, fromHistory = false) => {
    setViewFromHistory(fromHistory);
    setActiveSessionId(sessionId);
    setView("consultation");
    setSessionsOpen(false);
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    if (!window.confirm("Delete this recording? This cannot be undone.")) return;

    setBusySessionId(sessionId);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Delete failed (${res.status})`);
      if (activeSessionId === sessionId) goLive();
      else await loadConsultations(true);
    } catch (err) {
      setListError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusySessionId(null);
    }
  }, [activeSessionId, goLive, loadConsultations]);

  const handleSOAPApproved = useCallback(() => {
    goLive();
    loadConsultations(true);
  }, [goLive, loadConsultations]);

  const languageToggle = (
    <LanguageToggle value={language} onChange={setLanguage} />
  );

  const sessionsDrawer = (
    <SessionsDrawer
      open={sessionsOpen}
      onClose={() => setSessionsOpen(false)}
      activeSessions={activeSessions}
      historySessions={historySessions}
      loading={initialLoad}
      refreshing={refreshing}
      error={listError}
      busySessionId={busySessionId}
      lastRecordedSessionId={lastRecordedSessionId}
      onRefresh={() => loadConsultations(true)}
      onOpen={openSession}
      onTranscribe={runTranscription}
      onDelete={deleteSession}
      canDelete={(status) => ACTIVE_CONSULTATION_STATUSES.includes(status)}
    />
  );

  const recordingEngine = (
    <RecordingEngine
      patient={footerProps.patient ?? selectedPatient}
      recordState={recordState}
      onStartRecording={() => recording.startRecording()}
      onStopRecording={handleStopRecording}
      canApprove={footerProps.canApprove}
      approving={footerProps.approving}
      onApprove={footerProps.onApprove}
      onExport={footerProps.onExport}
      exporting={footerProps.exporting}
      onOpenVersions={footerProps.onOpenVersions}
      onOpenAudit={footerProps.onOpenAudit}
      onReject={footerProps.onReject}
    />
  );

  if (view === "consultation" && activeSessionId) {
    return (
      <div className="relative h-full min-h-0">
        <ConsultationWorkspace
          key={activeSessionId}
          sessionId={activeSessionId}
          onApproved={handleSOAPApproved}
          onEndSession={goLive}
          onOpenSessions={() => setSessionsOpen(true)}
          toolbarLeft={languageToggle}
          readOnly={viewFromHistory}
          pipelineBusy={pipelineBusy}
          pipelineMessage={pipelineMessage}
          onTranscriptionComplete={() => {
            setPipelineBusy(false);
            setPipelineMessage(null);
          }}
          onStartTranscription={runTranscription}
          autoGenerateNote={!viewFromHistory}
          onDelete={() => deleteSession(activeSessionId)}
          deleting={busySessionId === activeSessionId}
          selectedPatient={selectedPatient}
          onSelectedPatientChange={setSelectedPatient}
          onFooterProps={setFooterProps}
        />
        {sessionsDrawer}
        {recordingEngine}
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 flex-col pb-[72px]" data-testid="scribe-workflow">
      <PatientSelector
        patient={selectedPatient}
        onSelect={setSelectedPatient}
        onClear={() => setSelectedPatient(null)}
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h2 className="text-lg font-semibold text-gray-900">AI Medical Scribe</h2>
        <p className="max-w-md text-sm text-gray-600">
          Select a patient, then press <strong>Start Recording</strong> in the action bar below to begin the consultation.
        </p>
        {languageToggle}
        <Button variant="outline" size="sm" className="cursor-pointer" onClick={() => setSessionsOpen(true)}>
          View past sessions
        </Button>
      </div>

      {uploadError && (
        <div className="absolute bottom-20 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-4">
          <UploadErrorBanner
            error={uploadError}
            onDismiss={() => setUploadError(null)}
            onRelease={async () => {
              try {
                await fetch("/api/scribe/sessions/release-blocking", { method: "POST" });
                setUploadError(null);
              } catch (e) {
                setUploadError(e instanceof Error ? e : new Error(String(e)));
              }
            }}
          />
        </div>
      )}

      {sessionsDrawer}
      {recordingEngine}
    </div>
  );
}

function UploadErrorBanner({ error, onDismiss, onRelease }) {
  const isBlocked = error?.code === "SESSION_ALREADY_ACTIVE" ||
    /already active/i.test(error?.message ?? "");

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center space-y-2">
      <p className="text-[13px] text-red-600">{error.message}</p>
      <div className="flex justify-center gap-2">
        {isBlocked && (
          <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={onRelease}>
            Clear stuck session
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
