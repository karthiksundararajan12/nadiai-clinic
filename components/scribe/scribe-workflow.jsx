"use client";

/**
 * ScribeWorkflow — Record → Transcript → SOAP → Archive to history
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { ScribeRecordingPanel } from "@/components/scribe/scribe-recording-panel";
import { ConsultationHistoryTable } from "@/components/scribe/consultation-history-table";
import { uploadCompletedRecording } from "@/features/scribe/upload/audio-upload.client.js";
import { ConsultationWorkspace } from "@/features/scribe/consultation-workspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ACTIVE_CONSULTATION_STATUSES } from "@/features/scribe";
import {
  ArrowLeft,
  History,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";

const TRANSCRIBE_TIMEOUT_MS = 5 * 60 * 1000;

const ACTIVE_SOAP_STATUSES = new Set([
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
  "GENERATING_SOAP",
]);

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
  const [view, setView] = useState("home");
  const [listTab, setListTab] = useState("active");
  const [activeSessionId, setActiveSessionId] = useState(null);

  const [activeSessions, setActiveSessions] = useState([]);
  const [historySessions, setHistorySessions] = useState([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(null);

  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [busySessionId, setBusySessionId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [lastRecordedSessionId, setLastRecordedSessionId] = useState(null);
  const [viewFromHistory, setViewFromHistory] = useState(false);

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
    setActionError(null);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

    try {
      const payload = await fetchTranscriptionRun(sessionId, controller.signal);
      await loadConsultations(true);
      if (payload?.session?.status === "TRANSCRIBED") {
        setViewFromHistory(false);
        setActiveSessionId(sessionId);
        setView("consultation");
      }
      return payload;
    } catch (err) {
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Transcription timed out. Try again or check Deepgram API key."
          : err instanceof Error
            ? err.message
            : "Transcription failed";
      setActionError(new Error(message));
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
      if (err && typeof err === "object" && "details" in err) wrapped.details = err.details;
      setUploadError(wrapped);
    } finally {
      setPipelineBusy(false);
      setPipelineMessage(null);
    }
  }, [language, runTranscription]);

  const goHome = useCallback(() => {
    setView("home");
    setActiveSessionId(null);
    setViewFromHistory(false);
    loadConsultations(true);
  }, [loadConsultations]);

  const deleteSession = useCallback(async (sessionId) => {
    if (!window.confirm("Delete this recording? This cannot be undone.")) return;

    setBusySessionId(sessionId);
    setActionError(null);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Delete failed (${res.status})`);
      if (activeSessionId === sessionId) goHome();
      else await loadConsultations(true);
    } catch (err) {
      setActionError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusySessionId(null);
    }
  }, [activeSessionId, goHome, loadConsultations]);

  const handleSOAPApproved = useCallback(() => {
    goHome();
    setListTab("history");
  }, [goHome]);

  if (view === "consultation" && activeSessionId) {
    return (
      <div className="space-y-4">
        <WorkflowHeader
          title="Consultation"
          subtitle="Conversation on the left · SOAP note on the right"
          onBack={goHome}
          onDelete={viewFromHistory ? undefined : () => deleteSession(activeSessionId)}
        />
        <ConsultationWorkspace
          key={activeSessionId}
          sessionId={activeSessionId}
          onApproved={handleSOAPApproved}
          showToolbar={!viewFromHistory}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="scribe-workflow">
      <LanguageToggle value={language} onChange={setLanguage} />

      <Card className={cn(pipelineBusy && "border-primary/30")}>
        <CardContent className="flex flex-col items-center justify-center py-10 px-8">
          <ScribeRecordingPanel
            disabled={pipelineBusy}
            onRecordingComplete={handleRecordingComplete}
            onError={(err) => setUploadError(err)}
          />
          {pipelineBusy && pipelineMessage && (
            <p className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              {pipelineMessage}
            </p>
          )}
          {uploadError && (
            <UploadErrorBanner
              error={uploadError}
              onRelease={async () => {
                try {
                  await fetch("/api/scribe/sessions/release-blocking", { method: "POST" });
                  setUploadError(null);
                } catch (e) {
                  setUploadError(e instanceof Error ? e : new Error(String(e)));
                }
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base">Consultations</CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Active pipeline vs archived history after SOAP approval.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/scribe/history" className="gap-1.5">
                <History className="h-3.5 w-3.5" />
                Full history
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              data-testid="consultations-refresh"
              onClick={() => loadConsultations(true)}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {actionError && (
            <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {actionError.message}
            </div>
          )}

          {initialLoad ? (
            <p className="text-sm text-muted-foreground py-2">Loading consultations…</p>
          ) : listError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{listError.message}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => loadConsultations(true)}>
                Retry
              </Button>
            </div>
          ) : (
            <Tabs value={listTab} onValueChange={setListTab}>
              <TabsList>
                <TabsTrigger value="active">
                  Active ({activeSessions.length})
                </TabsTrigger>
                <TabsTrigger value="history">
                  History ({historySessions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="mt-4 space-y-2">
                {activeSessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    No active consultations. Record above to start.
                  </p>
                ) : (
                  activeSessions.map((session) => (
                    <ActiveConsultationRow
                      key={session.id}
                      session={session}
                      isLatestRecording={session.id === lastRecordedSessionId}
                      busy={busySessionId === session.id}
                      onTranscribe={() => runTranscription(session.id)}
                      onOpen={() => {
                        setViewFromHistory(false);
                        setActiveSessionId(session.id);
                        setView("consultation");
                      }}
                      onDelete={() => deleteSession(session.id)}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <ConsultationHistoryTable
                  consultations={historySessions}
                  busySessionId={busySessionId}
                  onViewTranscript={(id) => {
                    setViewFromHistory(true);
                    setActiveSessionId(id);
                    setView("consultation");
                  }}
                  onViewSOAP={(id) => {
                    setViewFromHistory(true);
                    setActiveSessionId(id);
                    setView("consultation");
                  }}
                  onViewVersions={(id) => {
                    setViewFromHistory(true);
                    setActiveSessionId(id);
                    setView("consultation");
                  }}
                  onViewAudit={async (id) => {
                    window.open(`/scribe/history`, "_self");
                  }}
                  onViewPrescription={() => {}}
                />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WorkflowHeader({ title, subtitle, onBack, onDelete }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="gap-1.5 text-destructive hover:text-destructive"
            data-testid="delete-session"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
      </div>
    </div>
  );
}

function UploadErrorBanner({ error, onRelease }) {
  const isBlocked = error?.code === "SESSION_ALREADY_ACTIVE" ||
    /already active/i.test(error?.message ?? "");

  return (
    <div className="mt-4 w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-center space-y-2">
      <p className="text-sm text-destructive">{error.message}</p>
      {isBlocked && (
        <Button type="button" variant="outline" size="sm" onClick={onRelease}>
          Clear stuck session and try again
        </Button>
      )}
    </div>
  );
}

function canDeleteSession(status) {
  return ACTIVE_CONSULTATION_STATUSES.includes(status);
}

function ActiveConsultationRow({
  session,
  isLatestRecording,
  busy,
  onTranscribe,
  onOpen,
  onDelete,
}) {
  const { status } = session;
  const date = new Date(session.created_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const needsTranscribe = ["UPLOADED", "TRANSCRIPTION_FAILED"].includes(status);
  const canRetryTranscribe = ["TRANSCRIPTION_QUEUED", "TRANSCRIBING"].includes(status);
  const canOpen =
    ["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"].includes(status) ||
    ACTIVE_SOAP_STATUSES.has(status);

  const statusLabel = status.replace(/_/g, " ");

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid="consultation-row"
      data-session-id={session.id}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{session.id.slice(0, 8)}…</span>
          {isLatestRecording && <Badge className="text-xs">Latest recording</Badge>}
          <Badge variant="outline" className="text-xs">{statusLabel}</Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {(needsTranscribe || canRetryTranscribe) && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onTranscribe} className="text-xs">
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : canRetryTranscribe ? "Retry" : "Transcribe"}
          </Button>
        )}
        {canOpen && (
          <Button
            size="sm"
            variant="default"
            data-testid="review-transcript"
            onClick={onOpen}
            className="text-xs"
          >
            Open
          </Button>
        )}
        {canDeleteSession(status) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={onDelete}
            className="text-xs text-destructive hover:text-destructive"
            data-testid="delete-session"
            title="Delete recording"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
