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
import { TranscriptReviewWorkspace } from "@/features/scribe/transcript-review";
import { SOAPReviewWorkspace } from "@/features/scribe/soap-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  History,
  Loader2,
  RefreshCw,
  Sparkles,
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
        setActiveSessionId(sessionId);
        setView("transcript");
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
      setUploadError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setPipelineBusy(false);
      setPipelineMessage(null);
    }
  }, [language, runTranscription]);

  const generateSOAP = useCallback(async (sessionId) => {
    setBusySessionId(sessionId);
    setActionError(null);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}/soap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint = payload?.details?.provider ? ` (provider: ${payload.details.provider})` : "";
        throw new Error((payload?.error || `SOAP generation failed (${res.status})`) + hint);
      }
      await loadConsultations(true);
      setActiveSessionId(sessionId);
      setView("soap");
    } catch (err) {
      setActionError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusySessionId(null);
    }
  }, [loadConsultations]);

  const goHome = useCallback(() => {
    setView("home");
    setActiveSessionId(null);
    loadConsultations(true);
  }, [loadConsultations]);

  const handleSOAPApproved = useCallback(() => {
    goHome();
    setListTab("history");
  }, [goHome]);

  if (view === "transcript" && activeSessionId) {
    return (
      <div className="space-y-4">
        <WorkflowHeader
          title="Transcript review"
          subtitle="Review the conversation, then complete review to enable SOAP"
          onBack={goHome}
        />
        <TranscriptReviewWorkspace key={activeSessionId} sessionId={activeSessionId} />
      </div>
    );
  }

  if (view === "soap" && activeSessionId) {
    return (
      <div className="space-y-4">
        <WorkflowHeader
          title="SOAP review"
          subtitle="Edit, save versions, and approve — moves to history when approved"
          onBack={goHome}
        />
        <SOAPReviewWorkspace
          key={activeSessionId}
          sessionId={activeSessionId}
          onApproved={handleSOAPApproved}
          onBack={goHome}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
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
            <div className="mt-4 w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-center">
              <p className="text-sm text-destructive">{uploadError.message}</p>
            </div>
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
                      onReviewTranscript={() => {
                        setActiveSessionId(session.id);
                        setView("transcript");
                      }}
                      onGenerateSOAP={() => generateSOAP(session.id)}
                      onReviewSOAP={() => {
                        setActiveSessionId(session.id);
                        setView("soap");
                      }}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <ConsultationHistoryTable
                  consultations={historySessions}
                  busySessionId={busySessionId}
                  onViewTranscript={(id) => {
                    setActiveSessionId(id);
                    setView("transcript");
                  }}
                  onViewSOAP={(id) => {
                    setActiveSessionId(id);
                    setView("soap");
                  }}
                  onViewVersions={(id) => {
                    setActiveSessionId(id);
                    setView("soap");
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

function WorkflowHeader({ title, subtitle, onBack }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onBack} className="gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Button>
    </div>
  );
}

function ActiveConsultationRow({
  session,
  isLatestRecording,
  busy,
  onTranscribe,
  onReviewTranscript,
  onGenerateSOAP,
  onReviewSOAP,
}) {
  const { status } = session;
  const date = new Date(session.created_at).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const needsTranscribe = ["UPLOADED", "TRANSCRIPTION_FAILED"].includes(status);
  const canRetryTranscribe = ["TRANSCRIPTION_QUEUED", "TRANSCRIBING"].includes(status);
  const canReviewTranscript = ["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"].includes(status);
  const canGenerateSOAP = status === "REVIEW_COMPLETED";
  const canReviewSOAP = ACTIVE_SOAP_STATUSES.has(status);

  const statusLabel = status.replace(/_/g, " ");

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
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
        {canReviewTranscript && (
          <Button size="sm" variant="outline" onClick={onReviewTranscript} className="text-xs">
            Review transcript
          </Button>
        )}
        {canGenerateSOAP && (
          <Button size="sm" disabled={busy} onClick={onGenerateSOAP} className="text-xs gap-1">
            <Sparkles className="h-3.5 w-3.5" />
            {busy ? "Generating…" : "Generate SOAP"}
          </Button>
        )}
        {canReviewSOAP && (
          <Button size="sm" variant="secondary" onClick={onReviewSOAP} className="text-xs">
            Review SOAP
          </Button>
        )}
      </div>
    </div>
  );
}
