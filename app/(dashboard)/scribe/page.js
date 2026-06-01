"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { ScribeRecorder } from "@/components/scribe/scribe-recorder";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useScribe } from "@/hooks/use-scribe";
import { ClipboardList, Mic, RefreshCw, Sparkles } from "lucide-react";

const SOAP_ACTION_STATUSES = [
  "REVIEW_COMPLETED",
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
  "SOAP_APPROVED",
];

export default function ScribePage() {
  const {
    isRecording,
    isPaused,
    language,
    setLanguage,
    duration,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  } = useScribe();

  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(null);
  const [generatingSessionId, setGeneratingSessionId] = useState(null);

  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const query = SOAP_ACTION_STATUSES
        .map((s) => `status=${encodeURIComponent(s)}`)
        .join("&");
      const res = await fetch(`/api/scribe/sessions?${query}&limit=10`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to load sessions (${res.status})`);
      setSessions(payload?.data ?? []);
    } catch (err) {
      setSessionsError(err);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const generateSOAP = useCallback(async (sessionId) => {
    setGeneratingSessionId(sessionId);
    setSessionsError(null);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}/soap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `SOAP generation failed (${res.status})`);
      await loadSessions();
    } catch (err) {
      setSessionsError(err);
    } finally {
      setGeneratingSessionId(null);
    }
  }, [loadSessions]);

  useEffect(() => {
    queueMicrotask(() => loadSessions());
  }, [loadSessions]);

  return (
    <>
      <Header
        title="AI Scribe"
        subtitle="Record consultations · transcription and SOAP notes generated automatically"
      />

      <div className="flex-1 p-6 space-y-6">

        {/* ── Language selector ──────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <LanguageToggle value={language} onChange={setLanguage} />
        </div>

        {/* ── Recorder card ─────────────────────────────────────────── */}
        <Card className={isRecording ? "border-primary/30 shadow-md shadow-primary/5" : "border-dashed"}>
          <CardContent className="flex items-center justify-center py-10 px-8">
            <ScribeRecorder
              isRecording={isRecording}
              isPaused={isPaused}
              duration={duration}
              onStart={startRecording}
              onPause={pauseRecording}
              onResume={resumeRecording}
              onStop={stopRecording}
            />
          </CardContent>
        </Card>

        {/* ── SOAP generation panel ──────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base">SOAP Note Generation</CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Sessions ready after transcript review is completed.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadSessions}
              disabled={sessionsLoading}
              className="shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sessionsLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Loading sessions…
              </div>
            ) : sessionsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">Unable to load SOAP actions.</p>
                <p className="mt-1 text-xs text-muted-foreground">{sessionsError.message}</p>
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No sessions ready yet. Complete a transcript review first.
              </p>
            ) : (
              <div className="space-y-2">
                {sessions.map((session) => {
                  const canGenerate = session.status === "REVIEW_COMPLETED";
                  const isGenerating = generatingSessionId === session.id;
                  const date = new Date(session.created_at).toLocaleString(undefined, {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  });
                  return (
                    <div
                      key={session.id}
                      className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium font-mono text-muted-foreground">
                            {session.id.slice(0, 8)}…
                          </p>
                          <Badge variant={canGenerate ? "warning" : "secondary"} className="text-xs">
                            {session.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{date}</p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => generateSOAP(session.id)}
                        disabled={!canGenerate || isGenerating}
                        className="shrink-0 gap-1.5"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {isGenerating ? "Generating…" : "Generate SOAP"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── How-it-works hint (idle only) ─────────────────────────── */}
        {!isRecording && (
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              {
                icon: <Mic className="h-5 w-5 text-primary" />,
                bg: "bg-primary/10",
                step: "1",
                title: "Record",
                desc: "Tap the mic and speak naturally with your patient",
              },
              {
                icon: <ClipboardList className="h-5 w-5 text-primary" />,
                bg: "bg-primary/10",
                step: "2",
                title: "Review Transcript",
                desc: "Transcription processes in the background after you stop",
              },
              {
                icon: <Sparkles className="h-5 w-5 text-primary" />,
                bg: "bg-primary/10",
                step: "3",
                title: "Generate SOAP",
                desc: "Click Generate SOAP above once review is complete",
              },
            ].map(({ icon, bg, step, title, desc }) => (
              <Card key={step} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`rounded-lg ${bg} p-2 shrink-0`}>{icon}</div>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
