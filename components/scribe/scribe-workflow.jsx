"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { uploadCompletedRecording } from "@/features/scribe/upload/audio-upload.client.js";
import { useRecording } from "@/features/scribe/recording/use-recording.js";
import { ConsultationWorkspace } from "@/features/scribe/consultation-workspace";
import { SessionsDrawer } from "@/features/scribe/consultation-workspace/components/SessionsDrawer.jsx";
import { ScribeRecordPanel } from "@/features/scribe/consultation-workspace/components/consultation/ScribeRecordPanel.jsx";
import { ScribeSoapPlaceholder } from "@/features/scribe/consultation-workspace/components/consultation/ScribeSoapPlaceholder.jsx";
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
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [viewFromHistory, setViewFromHistory] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

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
  const [workspaceState, setWorkspaceState] = useState({
    segments: [],
    transcriptLoading: false,
    transcriptLoadingMessage: null,
    sessionComplete: false,
  });

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
        setSessionsOpen(false);
      }
      return payload;
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Transcription timed out. Open Sessions and tap Transcribe to retry."
          : err instanceof Error
            ? err.message
            : "Transcription failed";
      const wrapped = new Error(message);
      setListError(wrapped);
      setUploadError(wrapped);
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
      setActiveSessionId(null);
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
    setActiveSessionId(null);
    setViewFromHistory(false);
    setUploadError(null);
    setSessionsOpen(false);
    setWorkspaceState({
      segments: [],
      transcriptLoading: false,
      transcriptLoadingMessage: null,
      sessionComplete: false,
    });
    recording.resetRecording?.();
  }, [recording.resetRecording]);

  const openSession = useCallback((sessionId, fromHistory = false) => {
    setViewFromHistory(fromHistory);
    setActiveSessionId(sessionId);
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

  const handleTranscriptionComplete = useCallback(() => {
    setPipelineBusy(false);
    setPipelineMessage(null);
  }, []);

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

  const recordPanelFooter = (
    <div className="space-y-3">
      {languageToggle}
      <Button
        variant="outline"
        size="sm"
        className="w-full cursor-pointer"
        onClick={() => setSessionsOpen(true)}
      >
        View past sessions
      </Button>
    </div>
  );

  const rightPanel = activeSessionId ? (
    <ConsultationWorkspace
      key={activeSessionId}
      sessionId={activeSessionId}
      onApproved={handleSOAPApproved}
      onEndSession={goLive}
      onOpenSessions={() => setSessionsOpen(true)}
      readOnly={viewFromHistory}
      pipelineBusy={pipelineBusy}
      pipelineMessage={pipelineMessage}
      onTranscriptionComplete={handleTranscriptionComplete}
      onStartTranscription={runTranscription}
      autoGenerateNote={!viewFromHistory}
      onDelete={() => deleteSession(activeSessionId)}
      deleting={busySessionId === activeSessionId}
      selectedPatient={selectedPatient}
      onSelectedPatientChange={setSelectedPatient}
      onWorkspaceStateChange={setWorkspaceState}
    />
  ) : (
    <ScribeSoapPlaceholder
      processing={pipelineBusy}
      message={pipelineMessage ?? "Processing…"}
      onOpenSessions={() => setSessionsOpen(true)}
    />
  );

  return (
    <div
      className="relative flex h-full min-h-0 flex-col md:flex-row"
      data-testid="scribe-workflow"
    >
      <ScribeRecordPanel
        recordState={recordState}
        durationLabel={recording.formattedDuration}
        statusMessage={pipelineMessage}
        disabled={Boolean(activeSessionId)}
        analyserNode={recording.analyserNode}
        transcriptSegments={workspaceState.segments}
        transcriptLoading={workspaceState.transcriptLoading || (pipelineBusy && Boolean(activeSessionId))}
        transcriptLoadingMessage={workspaceState.transcriptLoadingMessage ?? pipelineMessage}
        canStartNewSession={Boolean(activeSessionId) && workspaceState.sessionComplete}
        onStart={() => recording.startRecording()}
        onStop={handleStopRecording}
        onNewSession={goLive}
        footer={recordPanelFooter}
      />

      <main className="min-h-0 min-w-0 w-full md:w-[60%]">
        {rightPanel}
      </main>

      {uploadError && (
        <div className="absolute bottom-4 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-4 md:left-[calc(140px+50%)]">
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
    </div>
  );
}

function UploadErrorBanner({ error, onDismiss, onRelease }) {
  const isBlocked = error?.code === "SESSION_ALREADY_ACTIVE" ||
    /already active/i.test(error?.message ?? "");

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-center space-y-2 shadow-lg">
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
