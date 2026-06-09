"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientContextHeader } from "./PatientContextHeader.jsx";
import { ClinicalTimeline } from "./ClinicalTimeline.jsx";
import { ConsultationSummaryCard } from "./ConsultationSummaryCard.jsx";
import { ChatTranscriptPanel } from "./ChatTranscriptPanel.jsx";
import { ClinicalAudioPlayer } from "./ClinicalAudioPlayer.jsx";
import { SOAPCardsPanel, SOAPEmptyState } from "./SOAPCardsPanel.jsx";
import { ProductivityInsightsCard } from "./ProductivityInsightsCard.jsx";
import { ConsultationActionBar } from "./ConsultationActionBar.jsx";
import { VersionHistoryDrawer } from "./VersionHistoryDrawer.jsx";
import { AuditTrailDrawer } from "./AuditTrailDrawer.jsx";

export function ConsultationClinicalLayout({
  sessionId,
  patient,
  sessionDate,
  status,
  summary,
  metrics,
  quality,
  evidenceMap,
  transcriptProps,
  soapProps,
  actionBarProps,
  versions,
  onRestoreVersion,
  onCompareVersions,
  soapCompare,
  toolbarLeft,
  onOpenSessions,
  onEndSession,
  onDelete,
  deleting,
  saveStatus,
  hasUnsavedChanges,
  pipelineLabel,
}) {
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [split, setSplit] = useState(58);
  const dragging = useRef(false);
  const transcriptScrollRef = useRef(null);

  const scrollToSegment = useCallback((segmentId) => {
    const el = document.getElementById(`chat-segment-${segmentId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleEvidenceJump = useCallback((item) => {
    if (item?.id) scrollToSegment(item.id);
    if (item?.start_seconds != null) {
      transcriptProps.onPlayFromHere?.({ id: item.id, start_seconds: item.start_seconds });
    }
  }, [scrollToSegment, transcriptProps]);

  const handleCompare = useCallback(async (fromId, toId) => {
    if (onCompareVersions) await onCompareVersions(fromId, toId);
    else if (soapCompare) await soapCompare(fromId, toId);
  }, [onCompareVersions, soapCompare]);

  const transcriptColumn = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Conversation Transcript</h2>
        <p className="text-xs text-slate-500">AI-generated from consultation audio</p>
      </div>
      <div className="min-h-0 flex-1" ref={transcriptScrollRef}>
        <ChatTranscriptPanel
          {...transcriptProps}
          audioPlayer={
            transcriptProps.sessionId ? (
              <div className="border-b border-slate-100 p-4">
                <ClinicalAudioPlayer
                  sessionId={transcriptProps.sessionId}
                  onTimeUpdate={transcriptProps.onAudioTimeUpdate}
                  onSeekReady={transcriptProps.onSeekReady}
                />
              </div>
            ) : null
          }
        />
      </div>
    </div>
  );

  const soapColumn = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Clinical SOAP Note</h2>
        <p className="text-xs text-slate-500">Review and approve before signing</p>
      </div>
      <div className="min-h-0 flex-1">
        {soapProps.ready ? (
          <SOAPCardsPanel
            {...soapProps.panel}
            quality={quality}
            evidenceMap={evidenceMap}
            onEvidenceJump={handleEvidenceJump}
          />
        ) : (
          <SOAPEmptyState {...soapProps.empty} />
        )}
      </div>
    </div>
  );

  const summaryBlock = (
    <div className="space-y-4">
      <ConsultationSummaryCard summary={summary} />
      <ProductivityInsightsCard metrics={metrics} className="hidden xl:block" />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8fafc]" data-testid="consultation-workspace">
      <PatientContextHeader
        patient={patient}
        sessionDate={sessionDate}
        status={status}
        toolbarLeft={toolbarLeft}
        onOpenSessions={onOpenSessions}
        onEndSession={onEndSession}
        onDelete={onDelete}
        deleting={deleting}
        saveStatus={saveStatus}
        hasUnsavedChanges={hasUnsavedChanges}
        pipelineLabel={pipelineLabel}
      />
      <ClinicalTimeline status={status} />

      {/* Mobile & tablet tabs */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <Tabs defaultValue="transcript" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-3 grid w-auto grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="soap">SOAP</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="flex-1 overflow-y-auto px-4 pb-24 pt-3">
            {summaryBlock}
            <ProductivityInsightsCard metrics={metrics} className="mt-4 xl:hidden" />
          </TabsContent>
          <TabsContent value="transcript" className="min-h-0 flex-1 px-4 pb-24 pt-3">
            {summaryBlock}
            <div className="mt-4 h-[min(70vh,600px)]">{transcriptColumn}</div>
          </TabsContent>
          <TabsContent value="soap" className="min-h-0 flex-1 px-4 pb-24 pt-3">
            <div className="h-[min(70vh,600px)]">{soapColumn}</div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop layout */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 xl:flex-row">
          <div
            className="flex min-h-0 flex-col gap-4 overflow-hidden"
            style={{ width: `${split}%` }}
          >
            {summaryBlock}
            <div className="min-h-0 flex-1">{transcriptColumn}</div>
          </div>

          <div
            className="hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center bg-transparent hover:bg-teal-100/80 lg:flex"
            onMouseDown={() => { dragging.current = true; }}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize panels"
          >
            <div className="h-12 w-1 rounded-full bg-slate-300" />
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden">
            <div className="min-h-0 flex-1">{soapColumn}</div>
            <ProductivityInsightsCard metrics={metrics} className="shrink-0 xl:hidden" />
          </div>

          <ProductivityInsightsCard metrics={metrics} className="hidden w-64 shrink-0 xl:block" />
        </div>
      </div>

      <ConsultationActionBar
        {...actionBarProps}
        onOpenVersions={() => setVersionsOpen(true)}
        onOpenAudit={() => setAuditOpen(true)}
      />

      <VersionHistoryDrawer
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        versions={versions}
        readOnly={actionBarProps.readOnly}
        restoring={soapProps.panel?.saving}
        onRestore={onRestoreVersion}
        onCompare={handleCompare}
      />

      <AuditTrailDrawer
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        sessionId={sessionId}
      />

      <PanelResizeHandler dragging={dragging} onResize={setSplit} />
    </div>
  );
}

function PanelResizeHandler({ dragging, onResize }) {
  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const pct = (e.clientX / window.innerWidth) * 100;
      onResize(Math.min(72, Math.max(38, pct)));
    };
    const onUp = () => {
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onResize]);

  return null;
}
