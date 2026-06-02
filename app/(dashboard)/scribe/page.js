"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { ScribeWorkflow } from "@/components/scribe/scribe-workflow";
import { PrescriptionReviewWorkspace } from "@/components/scribe/prescription-review-workspace";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, RefreshCw, Sparkles } from "lucide-react";

const PRESCRIPTION_GENERATE_STATUSES = ["SOAP_APPROVED"];
const PRESCRIPTION_REVIEW_STATUSES = [
  "PRESCRIPTION_DRAFT_READY",
  "PRESCRIPTION_REVIEW_REQUIRED",
  "PRESCRIPTION_REVIEWING",
  "PRESCRIPTION_APPROVED",
];

export default function ScribePage() {
  const [rxSessions, setRxSessions] = useState([]);
  const [rxLoading, setRxLoading] = useState(true);
  const [rxError, setRxError] = useState(null);
  const [rxGenerating, setRxGenerating] = useState(null);
  const [rxReviewSessionId, setRxReviewSessionId] = useState(null);
  const [workflowKey, setWorkflowKey] = useState(0);

  const loadRxSessions = useCallback(async () => {
    setRxLoading(true);
    setRxError(null);
    try {
      const allStatuses = [...PRESCRIPTION_GENERATE_STATUSES, ...PRESCRIPTION_REVIEW_STATUSES];
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

  useEffect(() => {
    queueMicrotask(() => loadRxSessions());
  }, [loadRxSessions]);

  if (rxReviewSessionId) {
    return (
      <>
        <Header
          title="Prescription Review"
          subtitle="Review, edit, and approve the AI-generated prescription draft"
        />
        <div className="flex-1 p-6 space-y-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setRxReviewSessionId(null); loadRxSessions(); }}
          >
            ← Back to Scribe
          </Button>
          <PrescriptionReviewWorkspace
            sessionId={rxReviewSessionId}
            onApproved={() => { setRxReviewSessionId(null); loadRxSessions(); }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="AI Scribe"
        subtitle="Record doctor–patient consultations · transcribe · review · generate SOAP"
      />

      <div className="flex-1 p-6 space-y-6">
        <ScribeWorkflow
          key={workflowKey}
          onSessionsChange={() => setWorkflowKey((k) => k + 1)}
        />

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Prescription Review
              </CardTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                After SOAP is approved, generate and review prescription drafts.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={loadRxSessions} disabled={rxLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${rxLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {rxLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : rxError ? (
              <p className="text-sm text-destructive">{rxError.message}</p>
            ) : rxSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No prescriptions yet. Approve a SOAP note first, then generate a prescription draft.
              </p>
            ) : (
              <div className="space-y-2">
                {rxSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="font-mono text-sm text-muted-foreground">{session.id.slice(0, 8)}…</p>
                    <div className="flex gap-2">
                      {session.status === "SOAP_APPROVED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rxGenerating === session.id}
                          onClick={() => generatePrescription(session.id)}
                          className="gap-1 text-xs"
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          {rxGenerating === session.id ? "Generating…" : "Generate Rx"}
                        </Button>
                      )}
                      {PRESCRIPTION_REVIEW_STATUSES.includes(session.status) && (
                        <Button
                          size="sm"
                          onClick={() => setRxReviewSessionId(session.id)}
                          className="text-xs"
                        >
                          Review Rx
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
