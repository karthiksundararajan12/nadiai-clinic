"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { uploadCompletedRecording } from "@/features/scribe/upload/audio-upload.client.js";
import {
  ConsultationWorkspace,
  ScribeLiveSession,
} from "@/features/scribe/consultation-workspace";
import { SessionsDrawer } from "@/features/scribe/consultation-workspace/components/SessionsDrawer.jsx";
import { Button } from "@/components/ui/button";
import { ACTIVE_CONSULTATION_STATUSES } from "@/features/scribe";

const TRANSCRIBE_TIMEOUT_MS = 5 * 60 * 1000;

async function fetchTranscriptionRun(sessionId, signal) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}/transcription/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `Transcription failed (${res.status})`);
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
    setBusySessionId(sessionId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

    try {
      const payload = await fetchTranscriptionRun(sessionId, controller.signal);
      await loadConsultations(true);
      if (payload?.session?.status === "TRANSCRIBED") {
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
      setPipelineMessage("Transcribing conversation…");
      await runTranscription(sessionId);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (err && typeof err === "object" && "code" in err) wrapped.code = err.code;
      setUploadError(wrapped);
      setView("live");
    } finally {
      setPipelineBusy(false);
      setPipelineMessage(null);
    }
  }, [language, runTranscription]);

  const goLive = useCallback(() => {
    setView("live");
    setActiveSessionId(null);
    setViewFromHistory(false);
    setUploadError(null);
    setSessionsOpen(false);
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

  const languageBar = view === "live" && (
    <div className="absolute left-4 top-[60px] z-30 hidden lg:block">
      <LanguageToggle value={language} onChange={setLanguage} />
    </div>
  );

  if (view === "consultation" && activeSessionId) {
    return (
      <>
        {languageBar}
        <ConsultationWorkspace
          key={activeSessionId}
          sessionId={activeSessionId}
          onApproved={handleSOAPApproved}
          onEndSession={goLive}
          onOpenSessions={() => setSessionsOpen(true)}
          readOnly={viewFromHistory}
        />
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
      </>
    );
  }

  return (
    <div className="relative" data-testid="scribe-workflow">
      {languageBar}
      <ScribeLiveSession
        language={language}
        disabled={pipelineBusy}
        pipelineMessage={pipelineMessage}
        onRecordingComplete={handleRecordingComplete}
        onError={(err) => setUploadError(err)}
        onEndSession={goLive}
        onOpenSessions={() => setSessionsOpen(true)}
      />

      {uploadError && (
        <div className="absolute bottom-12 left-1/2 z-30 w-full max-w-md -translate-x-1/2 px-4">
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
    </div>
  );
}

function UploadErrorBanner({ error, onDismiss, onRelease }) {
  const isBlocked = error?.code === "SESSION_ALREADY_ACTIVE" ||
    /already active/i.test(error?.message ?? "");

  return (
    <div className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-center shadow-lg space-y-2">
      <p className="text-[13px] text-rose-600">{error.message}</p>
      <div className="flex justify-center gap-2">
        {isBlocked && (
          <Button type="button" variant="outline" size="sm" onClick={onRelease}>
            Clear stuck session
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
