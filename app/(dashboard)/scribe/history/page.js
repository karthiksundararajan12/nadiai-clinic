"use client";

import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { ConsultationHistoryTable } from "@/components/scribe/consultation-history-table";
import { SOAPReviewWorkspace } from "@/features/scribe/soap-review";
import { TranscriptReviewWorkspace } from "@/features/scribe/transcript-review";
import { PrescriptionReviewWorkspace } from "@/components/scribe/prescription-review-workspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ConsultationHistoryPage() {
  const [consultations, setConsultations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState("list");
  const [activeId, setActiveId] = useState(null);
  const [auditTrail, setAuditTrail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scribe/consultations/history?bucket=history&limit=100");
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to load history (${res.status})`);
      setConsultations(payload?.data ?? []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  const goList = useCallback(() => {
    setView("list");
    setActiveId(null);
    setAuditTrail(null);
    load();
  }, [load]);

  const openAudit = useCallback(async (sessionId) => {
    setActiveId(sessionId);
    setView("audit");
    try {
      const res = await fetch(`/api/scribe/consultations/${sessionId}`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Failed to load audit");
      setAuditTrail(payload?.auditTrail ?? []);
    } catch (err) {
      setError(err);
    }
  }, []);

  if (view === "transcript" && activeId) {
    return (
      <>
        <Header title="Transcript" subtitle="Read-only transcript review" />
        <div className="flex-1 p-6 space-y-4">
          <BackButton onClick={goList} />
          <TranscriptReviewWorkspace key={activeId} sessionId={activeId} />
        </div>
      </>
    );
  }

  if (view === "soap" && activeId) {
    return (
      <>
        <Header title="SOAP note" subtitle="Approved or archived SOAP" />
        <div className="flex-1 p-6 space-y-4">
          <BackButton onClick={goList} />
          <SOAPReviewWorkspace key={activeId} sessionId={activeId} onBack={goList} />
        </div>
      </>
    );
  }

  if (view === "rx" && activeId) {
    return (
      <>
        <Header title="Prescription review" subtitle="Archived prescription draft" />
        <div className="flex-1 p-6 space-y-4">
          <BackButton onClick={goList} />
          <PrescriptionReviewWorkspace sessionId={activeId} onApproved={goList} />
        </div>
      </>
    );
  }

  if (view === "audit" && activeId) {
    return (
      <>
        <Header title="Audit trail" subtitle={`Session ${activeId.slice(0, 8)}…`} />
        <div className="flex-1 p-6 space-y-4">
          <BackButton onClick={goList} />
          <Card>
            <CardContent className="p-4">
              {auditTrail?.length ? (
                <ul className="space-y-2 text-sm">
                  {auditTrail.map((entry) => (
                    <li key={entry.id} className="rounded border p-2">
                      <span className="font-medium">{entry.action}</span>
                      <span className="text-muted-foreground ml-2 text-xs">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">No audit events recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Consultation history"
        subtitle="Approved and completed consultations — immutable clinical record"
      />
      <div className="flex-1 p-6 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">All archived consultations</CardTitle>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading history…</p>
            ) : error ? (
              <p className="text-sm text-destructive">{error.message}</p>
            ) : (
              <ConsultationHistoryTable
                consultations={consultations}
                onViewTranscript={(id) => { setActiveId(id); setView("transcript"); }}
                onViewSOAP={(id) => { setActiveId(id); setView("soap"); }}
                onViewVersions={(id) => { setActiveId(id); setView("soap"); }}
                onViewAudit={openAudit}
                onViewPrescription={(id) => { setActiveId(id); setView("rx"); }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BackButton({ onClick }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5">
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to history
    </Button>
  );
}
