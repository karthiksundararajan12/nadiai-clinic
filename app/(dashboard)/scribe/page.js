"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { ScribeRecorder } from "@/components/scribe/scribe-recorder";
import { TranscriptViewer } from "@/components/scribe/transcript-viewer";
import { ScribeNotes } from "@/components/scribe/scribe-notes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useScribe } from "@/hooks/use-scribe";
import { FileText, RefreshCw, RotateCcw, Sparkles } from "lucide-react";

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
    transcription,
    clinicalNote,
    transcriptionError,
    duration,
    isGeneratingNote,
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
        .map((status) => `status=${encodeURIComponent(status)}`)
        .join("&");
      const res = await fetch(`/api/scribe/sessions?${query}&limit=10`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || `Failed to load scribe sessions (${res.status})`);
      }
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
      if (!res.ok) {
        throw new Error(payload?.error || `SOAP generation failed (${res.status})`);
      }
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
        subtitle="Record consultations and review production transcript/SOAP outputs"
      />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <LanguageToggle value={language} onChange={setLanguage} />
          <div className="flex items-center gap-2">
            {transcription.length > 0 && !isRecording && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                New Session
              </Button>
            )}
          </div>
        </div>

        <Card className="border-dashed">
          <CardContent className="flex items-center justify-center p-8">
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

        <div className="grid gap-6 lg:grid-cols-2">
          <TranscriptViewer
            transcription={transcription}
            language={language}
            isRecording={isRecording}
            error={transcriptionError}
          />
          <ScribeNotes
            clinicalNote={clinicalNote}
            isGeneratingNote={isGeneratingNote}
          />
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Production SOAP generation</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Generate SOAP notes only after transcript review is completed.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadSessions} disabled={sessionsLoading}>
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <p className="text-sm text-muted-foreground">Loading reviewed scribe sessions...</p>
            ) : sessionsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">Unable to load SOAP actions.</p>
                <p className="mt-1 text-xs text-muted-foreground">{sessionsError.message}</p>
              </div>
            ) : sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No reviewed transcript sessions found. Complete transcript review first, then the Generate SOAP button will appear here.
              </p>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => {
                  const canGenerate = session.status === "REVIEW_COMPLETED";
                  return (
                    <div
                      key={session.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">Session {session.id}</p>
                          <Badge variant={canGenerate ? "warning" : "secondary"}>{session.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Created {new Date(session.created_at).toLocaleString()}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => generateSOAP(session.id)}
                        disabled={!canGenerate || generatingSessionId === session.id}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {generatingSessionId === session.id ? "Generating..." : "Generate SOAP"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {!isRecording && transcription.length === 0 && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <span className="text-lg">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Select Language</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose Hinglish, Hindi, or English for transcription
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2">
                  <span className="text-lg">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Record Consultation</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap the mic button and speak naturally with your patient
                  </p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-accent/10 p-2">
                  <FileText className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-sm font-medium">SOAP Review</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    SOAP note has not been generated.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
