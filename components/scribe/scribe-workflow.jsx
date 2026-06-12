"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { Toast } from "@/components/ui/toast";
import { uploadCompletedRecording } from "@/features/scribe/upload/audio-upload.client.js";
import { submitManualTranscript } from "@/features/scribe/upload/manual-transcript.client.js";
import { useRecording } from "@/features/scribe/recording/use-recording.js";
import { useAudioLevel } from "@/features/scribe/recording/use-audio-level.js";
import { RECORDING_LIMITS } from "@/features/scribe/recording/constants.js";
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
  const [toastMessage, setToastMessage] = useState(null);
  const [manualInputMode, setManualInputMode] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [busySessionId, setBusySessionId] = useState(null);
  const [lastRecordedSessionId, setLastRecordedSessionId] = useState(null);
  const [workspaceState, setWorkspaceState] = useState({
    segments: [],
    transcriptLoading: false,
    transcriptLoadingMessage: null,
    sessionComplete: false,
    highlightedSegmentId: null,
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

  const isRecordingLive = recording.isRecording || recording.isPaused;
  const { level: audioLevel } = useAudioLevel(recording.analyserNode, isRecordingLive);
  const audioStatsRef = useRef({ sum: 0, count: 0, peak: 0 });

  useEffect(() => {
    if (recording.isRequesting) {
      audioStatsRef.current = { sum: 0, count: 0, peak: 0 };
    }
  }, [recording.isRequesting]);

  useEffect(() => {
    if (!recording.isRecording) return;
    audioStatsRef.current.sum += audioLevel;
    audioStatsRef.current.count += 1;
    audioStatsRef.current.peak = Math.max(audioStatsRef.current.peak, audioLevel);
  }, [audioLevel, recording.isRecording]);

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

  useEffect(() => {
    if (sessionsOpen) void loadConsultations(true);
  }, [sessionsOpen, loadConsultations]);

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
      const duration = recording.duration;
      const stats = audioStatsRef.current;
      const avgLevel = stats.count > 0 ? stats.sum / stats.count : 0;
      const tooShort = duration < RECORDING_LIMITS.MIN_DURATION_SECONDS;
      const unclear =
        stats.peak < RECORDING_LIMITS.MIN_PEAK_AUDIO_LEVEL ||
        avgLevel < RECORDING_LIMITS.MIN_AVG_AUDIO_LEVEL;

      if (tooShort && unclear) {
        setToastMessage(
          "Recording is too short and audio is not clear. Speak louder and record for at least 10 seconds.",
        );
        await recording.stopRecording();
        recording.resetRecording();
        return;
      }
      if (tooShort) {
        setToastMessage("Recording is too short. Please record for at least 10 seconds.");
        await recording.stopRecording();
        recording.resetRecording();
        return;
      }
      if (unclear) {
        setToastMessage("Audio is not clear. Please speak louder and try again.");
        await recording.stopRecording();
        recording.resetRecording();
        return;
      }

      const chunks = await recording.stopRecording();
      await handleRecordingComplete(chunks, recording.mimeType, duration);
    } catch (err) {
      setUploadError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [handleRecordingComplete, recording]);

  const recordState = useMemo(() => {
    if (pipelineBusy) return "processing";
    if (recording.isRequesting) return "requesting";
    if (recording.isPaused) return "paused";
    if (recording.isRecording) return "recording";
    return "idle";
  }, [
    pipelineBusy,
    recording.isRequesting,
    recording.isPaused,
    recording.isRecording,
  ]);

  const goLive = useCallback(() => {
    setActiveSessionId(null);
    setViewFromHistory(false);
    setUploadError(null);
    setManualInputMode(false);
    setManualSubmitting(false);
    setSessionsOpen(false);
    setWorkspaceState({
      segments: [],
      transcriptLoading: false,
      transcriptLoadingMessage: null,
      sessionComplete: false,
    });
    recording.resetRecording?.();
  }, [recording.resetRecording]);

  const handleManualTranscriptSubmit = useCallback(async (text) => {
    setUploadError(null);
    setManualSubmitting(true);
    setPipelineMessage("Saving transcript…");

    try {
      const result = await submitManualTranscript({
        text,
        language,
        patientId: selectedPatient?.id,
      });

      const sessionId = result?.session?.id;
      if (!sessionId) throw new Error("Transcript saved but no session id was returned");

      setLastRecordedSessionId(sessionId);
      setActiveSessionId(sessionId);
      setViewFromHistory(false);
      setManualInputMode(false);
      setPipelineMessage(null);
      await loadConsultations(true);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (err && typeof err === "object" && "code" in err) wrapped.code = err.code;
      setUploadError(wrapped);
      setPipelineMessage(null);
    } finally {
      setManualSubmitting(false);
    }
  }, [language, loadConsultations, selectedPatient?.id]);

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

  const handleSOAPApproved = useCallback((result) => {
    const approvedId = result?.session?.id ?? activeSessionId;
    const approvedSession = result?.session;

    if (approvedId) {
      setActiveSessions((prev) => prev.filter((s) => s.id !== approvedId));
      if (approvedSession) {
        const row = {
          ...approvedSession,
          approval_status: "approved",
          soap_status: "approved",
        };
        setHistorySessions((prev) => [
          row,
          ...prev.filter((s) => s.id !== approvedId),
        ]);
      }
    }

    goLive();
    void loadConsultations(true);
  }, [activeSessionId, goLive, loadConsultations]);

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
      {!manualInputMode && languageToggle}
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
        pauseSupported={recording.pauseSupported}
        transcriptSegments={workspaceState.segments}
        highlightedSegmentId={workspaceState.highlightedSegmentId}
        transcriptLoading={workspaceState.transcriptLoading || (pipelineBusy && Boolean(activeSessionId))}
        transcriptLoadingMessage={workspaceState.transcriptLoadingMessage ?? pipelineMessage}
        canStartNewSession={Boolean(activeSessionId) && workspaceState.sessionComplete}
        onStart={() => recording.startRecording()}
        onPause={recording.pauseRecording}
        onResume={recording.resumeRecording}
        onStop={handleStopRecording}
        onNewSession={goLive}
        manualMode={manualInputMode}
        onManualModeChange={setManualInputMode}
        onManualSubmit={handleManualTranscriptSubmit}
        manualSubmitting={manualSubmitting}
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

      {toastMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <Toast
            message={toastMessage}
            variant="warning"
            onDismiss={() => setToastMessage(null)}
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
