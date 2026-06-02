"use client";

/**
 * ScribeWorkflow — end-to-end consultation flow on the Scribe page:
 * Record → Upload → Transcribe (doctor/patient diarization) → Review transcript → Generate SOAP
 */

import { useCallback, useEffect, useState } from "react";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { RecordingControls } from "@/features/scribe/components/recording/RecordingControls.jsx";
import { uploadCompletedRecording } from "@/features/scribe/upload/audio-upload.client.js";
import { TranscriptReviewWorkspace } from "@/features/scribe/transcript-review";
import { SOAPReviewWorkspace } from "@/features/scribe/soap-review";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ClipboardList,
  Loader2,
  Mic,
  RefreshCw,
  Sparkles,
} from "lucide-react";

const CONSULTATION_STATUSES = [
  "CREATED",
  "RECORDING",
  "UPLOADING",
  "UPLOADED",
  "TRANSCRIPTION_QUEUED",
  "TRANSCRIBING",
  "TRANSCRIBED",
  "TRANSCRIPTION_FAILED",
  "REVIEWING",
  "REVIEW_COMPLETED",
  "GENERATING_SOAP",
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
  "SOAP_APPROVED",
];

const PROCESSING = new Set([
  "UPLOADING",
  "TRANSCRIPTION_QUEUED",
  "TRANSCRIBING",
  "GENERATING_SOAP",
  "GENERATING_PRESCRIPTION",
]);

/**
 * @param {{
 *   onSessionsChange?: () => void;
 * }} props
 */
export function ScribeWorkflow({ onSessionsChange }) {
  const [language, setLanguage] = useState("english");
  const [view, setView] = useState("home");
  const [activeSessionId, setActiveSessionId] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);

  const [uploadPhase, setUploadPhase] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const [busySessionId, setBusySessionId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadConsultations = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const query = CONSULTATION_STATUSES
        .map((s) => `status=${encodeURIComponent(s)}`)
        .join("&");
      const res = await fetch(`/api/scribe/sessions?${query}&limit=20&sort_order=desc`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to load consultations (${res.status})`);
      setSessions(payload?.data ?? []);
      onSessionsChange?.();
    } catch (err) {
      setListError(err);
    } finally {
      setLoading(false);
    }
  }, [onSessionsChange]);

  useEffect(() => {
    queueMicrotask(() => loadConsultations());
  }, [loadConsultations]);

  const runTranscription = useCallback(async (sessionId) => {
    setBusySessionId(sessionId);
    setActionError(null);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}/transcription/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Transcription failed (${res.status})`);
      await loadConsultations();
      if (payload?.session?.status === "TRANSCRIBED") {
        setActiveSessionId(sessionId);
        setView("transcript");
      }
      return payload;
    } catch (err) {
      setActionError(err);
      throw err;
    } finally {
      setBusySessionId(null);
    }
  }, [loadConsultations]);

  const handleRecordingComplete = useCallback(async (chunks, mimeType, durationSeconds = 0) => {
    if (!chunks?.length) {
      setUploadError(new Error("No audio was captured. Check microphone permissions and try again."));
      return;
    }

    setUploadError(null);
    setUploadPhase("uploading");
    setUploadProgress(0);

    try {
      const audioDurationSeconds = Math.max(1, durationSeconds || 30);

      const finalized = await uploadCompletedRecording({
        chunks,
        audioDurationSeconds,
        language,
        onProgress: (event) => {
          setUploadPhase(event.phase);
          setUploadProgress(event.progress ?? 0);
          if (event.sessionId) setBusySessionId(event.sessionId);
        },
      });

      const sessionId = finalized?.session?.id ?? finalized?.id;
      if (!sessionId) throw new Error("Upload finished but no session id was returned");

      setUploadPhase("transcribing");
      await runTranscription(sessionId);
      setUploadPhase(null);
    } catch (err) {
      setUploadError(err);
      setUploadPhase(null);
    } finally {
      setBusySessionId(null);
    }
  }, [language, runTranscription]);

  const generateSOAP = useCallback(async (sessionId) => {
    setBusySessionId(sessionId);
    setActionError(null);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}/soap/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hint = payload?.details?.provider ? ` (provider: ${payload.details.provider})` : "";
        throw new Error((payload?.error || `SOAP generation failed (${res.status})`) + hint);
      }
      await loadConsultations();
      setActiveSessionId(sessionId);
      setView("soap");
    } catch (err) {
      setActionError(err);
    } finally {
      setBusySessionId(null);
    }
  }, [loadConsultations]);

  const openTranscriptReview = useCallback((sessionId) => {
    setActiveSessionId(sessionId);
    setView("transcript");
  }, []);

  const openSoapReview = useCallback((sessionId) => {
    setActiveSessionId(sessionId);
    setView("soap");
  }, []);

  const goHome = useCallback(() => {
    setView("home");
    setActiveSessionId(null);
    loadConsultations();
  }, [loadConsultations]);

  if (view === "transcript" && activeSessionId) {
    return (
      <div className="space-y-4">
        <WorkflowHeader
          title="Transcript Review"
          subtitle="Review doctor and patient conversation, then complete review to enable SOAP generation"
          onBack={goHome}
        />
        <TranscriptReviewWorkspace sessionId={activeSessionId} />
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={goHome}>
            Back to consultations
          </Button>
        </div>
      </div>
    );
  }

  if (view === "soap" && activeSessionId) {
    return (
      <div className="space-y-4">
        <WorkflowHeader
          title="SOAP Note Review"
          subtitle="Review and approve the AI-generated SOAP note"
          onBack={goHome}
        />
        <SOAPReviewWorkspace sessionId={activeSessionId} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <LanguageToggle value={language} onChange={setLanguage} />
      </div>

      {/* Recording */}
      <Card className={uploadPhase ? "border-primary/30" : "border-dashed"}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Record consultation
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Record the doctor–patient conversation. Audio uploads automatically when you stop, then
            Deepgram transcribes with speaker labels.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4 pb-8">
          <RecordingControls
            disabled={Boolean(uploadPhase)}
            onRecordingComplete={handleRecordingComplete}
            className="border-border bg-card shadow-sm"
          />

          {uploadPhase && (
            <div className="w-full max-w-md rounded-lg border bg-muted/30 px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                <span>
                  {uploadPhase === "uploading" && `Uploading audio… ${uploadProgress}%`}
                  {uploadPhase === "transcribing" && "Transcribing with Deepgram (doctor / patient speakers)…"}
                  {uploadPhase === "finalizing" && "Finalizing upload…"}
                  {!["uploading", "transcribing", "finalizing"].includes(uploadPhase) &&
                    `Processing: ${uploadPhase}`}
                </span>
              </div>
            </div>
          )}

          {uploadError && (
            <div className="w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">Recording / upload failed</p>
              <p className="mt-1 text-xs text-muted-foreground">{uploadError.message}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consultations list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Your consultations
            </CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Transcribe → review transcript → generate SOAP.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadConsultations} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          ) : listError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium text-destructive">Unable to load consultations.</p>
              <p className="mt-1 text-xs text-muted-foreground">{listError.message}</p>
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              No consultations yet. Record a consultation above to get started.
            </p>
          ) : (
            <div className="space-y-2">
              {actionError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-2">
                  <p className="text-sm text-destructive">{actionError.message}</p>
                </div>
              )}
              {sessions.map((session) => (
                <ConsultationRow
                  key={session.id}
                  session={session}
                  busy={busySessionId === session.id}
                  onTranscribe={() => runTranscription(session.id)}
                  onReviewTranscript={() => openTranscriptReview(session.id)}
                  onGenerateSOAP={() => generateSOAP(session.id)}
                  onReviewSOAP={() => openSoapReview(session.id)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { step: "1", title: "Record", desc: "Doctor and patient conversation" },
          { step: "2", title: "Review transcript", desc: "Verify speakers and text" },
          { step: "3", title: "Generate SOAP", desc: "AI draft for your approval" },
        ].map(({ step, title, desc }) => (
          <Card key={step} className="p-4">
            <p className="text-xs font-semibold text-primary">Step {step}</p>
            <p className="text-sm font-semibold mt-1">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
          </Card>
        ))}
      </div>
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
      <Button variant="outline" size="sm" onClick={onBack} className="shrink-0 gap-1.5">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </Button>
    </div>
  );
}

/**
 * @param {{
 *   session: { id: string; status: string; created_at: string };
 *   busy: boolean;
 *   onTranscribe: () => void;
 *   onReviewTranscript: () => void;
 *   onGenerateSOAP: () => void;
 *   onReviewSOAP: () => void;
 * }} props
 */
function ConsultationRow({
  session,
  busy,
  onTranscribe,
  onReviewTranscript,
  onGenerateSOAP,
  onReviewSOAP,
}) {
  const status = session.status;
  const date = new Date(session.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const canTranscribe = ["UPLOADED", "TRANSCRIPTION_FAILED"].includes(status);
  const canReviewTranscript = ["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"].includes(status);
  const canGenerateSOAP = status === "REVIEW_COMPLETED";
  const canReviewSOAP = [
    "SOAP_READY",
    "SOAP_REVIEW_REQUIRED",
    "SOAP_REVIEWING",
    "SOAP_APPROVED",
  ].includes(status);
  const isProcessing = PROCESSING.has(status);

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-mono text-sm text-muted-foreground">{session.id.slice(0, 8)}…</p>
          <Badge variant={isProcessing ? "secondary" : "outline"} className="text-xs">
            {status.replace(/_/g, " ")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{date}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {canTranscribe && (
          <Button size="sm" variant="outline" disabled={busy} onClick={onTranscribe} className="text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Transcribe"}
          </Button>
        )}
        {isProcessing && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing…
          </span>
        )}
        {canReviewTranscript && (
          <Button size="sm" variant="outline" onClick={onReviewTranscript} className="text-xs gap-1">
            <ClipboardList className="h-3.5 w-3.5" />
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
            View SOAP
          </Button>
        )}
      </div>
    </div>
  );
}
