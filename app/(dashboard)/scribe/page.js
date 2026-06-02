"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { ScribeRecorder } from "@/components/scribe/scribe-recorder";
import { PrescriptionReviewWorkspace } from "@/components/scribe/prescription-review-workspace";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useScribe } from "@/hooks/use-scribe";
import { ClipboardList, FileText, Mic, RefreshCw, Sparkles } from "lucide-react";

// Statuses eligible for SOAP generation
const SOAP_ACTION_STATUSES = [
  "REVIEW_COMPLETED",
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
  "SOAP_APPROVED",
];

// Statuses eligible for prescription generation (trigger fresh draft)
const PRESCRIPTION_GENERATE_STATUSES = ["SOAP_APPROVED"];

// Statuses eligible for prescription review workspace
const PRESCRIPTION_REVIEW_STATUSES = [
  "PRESCRIPTION_DRAFT_READY",
  "PRESCRIPTION_REVIEW_REQUIRED",
  "PRESCRIPTION_REVIEWING",
  "PRESCRIPTION_APPROVED",
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

  // ── SOAP panel state ───────────────────────────────────────────────────
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState(null);
  const [generatingSessionId, setGeneratingSessionId] = useState(null);

  // ── Prescription panel state ───────────────────────────────────────────
  const [rxSessions, setRxSessions] = useState([]);
  const [rxLoading, setRxLoading] = useState(true);
  const [rxError, setRxError] = useState(null);
  const [rxGenerating, setRxGenerating] = useState(null);
  const [rxReviewSessionId, setRxReviewSessionId] = useState(null);

  // ── Load SOAP sessions ─────────────────────────────────────────────────
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

  // ── Load prescription sessions ─────────────────────────────────────────
  const loadRxSessions = useCallback(async () => {
    setRxLoading(true);
    setRxError(null);
    try {
      const allStatuses = [
        ...PRESCRIPTION_GENERATE_STATUSES,
        ...PRESCRIPTION_REVIEW_STATUSES,
      ];
      const query = allStatuses.map((s) => `status=${encodeURIComponent(s)}`).join("&");
      const res = await fetch(`/api/scribe/sessions?${query}&limit=20`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to load sessions (${res.status})`);
      setRxSessions(payload?.data ?? []);
    } catch (err) {
      setRxError(err);
    } finally {
      setRxLoading(false);
    }
  }, []);

  // ── Generate SOAP ─────────────────────────────────────────────────────
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

  // ── Generate prescription ─────────────────────────────────────────────
  const generatePrescription = useCallback(async (sessionId) => {
    setRxGenerating(sessionId);
    setRxError(null);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}/prescription/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: false }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Prescription generation failed (${res.status})`);
      await loadRxSessions();
    } catch (err) {
      setRxError(err);
    } finally {
      setRxGenerating(null);
    }
  }, [loadRxSessions]);

  const handleRxApproved = useCallback(async () => {
    setRxReviewSessionId(null);
    await loadRxSessions();
  }, [loadRxSessions]);

  useEffect(() => {
    queueMicrotask(() => loadSessions());
    queueMicrotask(() => loadRxSessions());
  }, [loadSessions, loadRxSessions]);

  // ── Prescription review inline panel ──────────────────────────────────
  if (rxReviewSessionId) {
    return (
      <>
        <Header
          title="Prescription Review"
          subtitle="Review, edit, and approve the AI-generated prescription draft"
        />
        <div className="flex-1 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono text-muted-foreground">
              Session {rxReviewSessionId.slice(0, 8)}…
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setRxReviewSessionId(null); loadRxSessions(); }}
              className="text-xs gap-1.5"
            >
              ← Back to Scribe
            </Button>
          </div>
          <PrescriptionReviewWorkspace
            sessionId={rxReviewSessionId}
            onApproved={handleRxApproved}
          />
        </div>
      </>
    );
  }

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
                  const canGenerate  = session.status === "REVIEW_COMPLETED";
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

        {/* ── Prescription panel ─────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Prescription Review
              </CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Generate and review AI prescription drafts after SOAP is approved.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadRxSessions}
              disabled={rxLoading}
              className="shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${rxLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {rxLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                Loading sessions…
              </div>
            ) : rxError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">Unable to load prescription sessions.</p>
                <p className="mt-1 text-xs text-muted-foreground">{rxError.message}</p>
              </div>
            ) : rxSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No sessions ready for prescriptions. Approve a SOAP note first.
              </p>
            ) : (
              <div className="space-y-2">
                {rxSessions.map((session) => {
                  const canGenerate  = PRESCRIPTION_GENERATE_STATUSES.includes(session.status);
                  const canReview    = PRESCRIPTION_REVIEW_STATUSES.includes(session.status);
                  const isGenerating = rxGenerating === session.id;
                  const isApproved   = session.status === "PRESCRIPTION_APPROVED";
                  const date = new Date(session.created_at).toLocaleString(undefined, {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  });

                  const badgeClass = isApproved
                    ? "bg-green-100 text-green-800"
                    : canReview
                    ? "bg-violet-100 text-violet-800"
                    : "bg-amber-100 text-amber-800";

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
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeClass}`}>
                            {session.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">{date}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {canGenerate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => generatePrescription(session.id)}
                            disabled={isGenerating}
                            className="gap-1.5 text-xs"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {isGenerating ? "Generating…" : "Generate Rx"}
                          </Button>
                        )}
                        {canReview && !isApproved && (
                          <Button
                            size="sm"
                            onClick={() => setRxReviewSessionId(session.id)}
                            className="gap-1.5 text-xs"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            Review Rx
                          </Button>
                        )}
                        {isApproved && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRxReviewSessionId(session.id)}
                            className="gap-1.5 text-xs"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            View Rx
                          </Button>
                        )}
                      </div>
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
                title: "Generate & Review",
                desc: "Generate SOAP notes, then generate and review prescriptions",
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
