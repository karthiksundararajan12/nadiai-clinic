"use client";

import { useCallback } from "react";
import { PatientSelector } from "../consultation/PatientSelector.jsx";
import { PatientHistoryPanel } from "../consultation/PatientHistoryPanel.jsx";
import { ConsultationSummary } from "../consultation/ConsultationSummary.jsx";
import { CollapsibleTranscriptPanel } from "../consultation/TranscriptPanel.jsx";
import { SOAPEditor, SOAPEditorEmpty } from "../consultation/SOAPEditor.jsx";
import { ProductivityInsightsCard } from "./ProductivityInsightsCard.jsx";
import { AISuggestions } from "../consultation/AISuggestions.jsx";
import { PrescriptionPreview, ApprovedStatusBadge } from "../consultation/PrescriptionPreview.jsx";
import { ClinicalTimeline } from "./ClinicalTimeline.jsx";
import { VersionHistoryDrawer } from "./VersionHistoryDrawer.jsx";
import { AuditTrailDrawer } from "./AuditTrailDrawer.jsx";

export function ConsultationClinicalLayout({
  sessionId,
  patient,
  onPatientSelect,
  onPatientClear,
  sessionDate,
  status,
  summary,
  summaryHandlers,
  metrics,
  quality,
  insights,
  icdOverride,
  onIcdOverride,
  rpmEnabled,
  onRpmToggle,
  evidenceMap,
  transcriptSegments,
  transcriptReadOnly,
  transcriptSaving,
  onTranscriptRegenerate,
  transcriptRegenerating,
  soapProps,
  readOnly,
  toolbarLeft,
  onOpenSessions,
  versions,
  onRestoreVersion,
  onCompareVersions,
  approveBanner,
  onEvidenceJump: externalEvidenceJump,
  versionsOpen,
  onVersionsOpenChange,
  auditOpen,
  onAuditOpenChange,
}) {

  const scrollToSegment = useCallback((segmentId) => {
    document.getElementById(`chat-segment-${segmentId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleEvidenceJump = useCallback((item) => {
    if (item?.id) scrollToSegment(item.id);
    externalEvidenceJump?.(item);
  }, [scrollToSegment, externalEvidenceJump]);

  const handleCompare = useCallback(async (fromId, toId) => {
    await onCompareVersions?.(fromId, toId);
  }, [onCompareVersions]);

  const soapApproved =
    status === "SOAP_APPROVED" || status === "COMPLETED" || status === "READY_FOR_PRESCRIPTION";

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50 pb-[72px]" data-testid="consultation-workspace">
      <PatientSelector patient={patient} onSelect={onPatientSelect} onClear={onPatientClear} />

      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-2">
        <div className="flex items-center gap-3">
          {toolbarLeft}
          {onOpenSessions && (
            <button type="button" className="cursor-pointer text-xs text-cyan-600 hover:underline" onClick={onOpenSessions}>
              Sessions
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ApprovedStatusBadge approved={soapApproved} />
          {sessionDate && (
            <span className="text-xs text-gray-500">
              {new Date(sessionDate).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      <ClinicalTimeline status={status} />

      <PrescriptionPreview {...approveBanner} />

      {/* 3-column layout — stacks below md (768px) */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* LEFT — 260px history */}
        <aside className="w-full shrink-0 border-b border-gray-200 bg-white md:w-[260px] md:border-b-0 md:border-r">
          <PatientHistoryPanel patient={patient} />
        </aside>

        {/* CENTER — flex-1 SOAP + summary */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:min-w-[500px]">
          <div className="mx-auto max-w-3xl space-y-4">
            <ConsultationSummary
              summary={summary}
              readOnly={readOnly}
              {...summaryHandlers}
            />
            <CollapsibleTranscriptPanel
              segments={transcriptSegments}
              readOnly={transcriptReadOnly}
              saving={transcriptSaving}
              regenerating={transcriptRegenerating}
              onRegenerateFromTranscript={onTranscriptRegenerate}
            />
            {soapProps.ready ? (
              <SOAPEditor
                {...soapProps.panel}
                quality={quality}
                evidenceMap={evidenceMap}
                onEvidenceJump={handleEvidenceJump}
                onRegenerate={soapProps.panel.onRegenerate}
              />
            ) : (
              <SOAPEditorEmpty {...soapProps.empty} />
            )}
          </div>
        </main>

        {/* RIGHT — 300px insights */}
        <aside className="w-full shrink-0 border-t border-gray-200 bg-white p-4 md:w-[300px] md:border-t-0 md:border-l">
          <div className="space-y-3">
            <ProductivityInsightsCard metrics={metrics} />
            <AISuggestions
              icd={insights?.icd}
              rpm={insights?.rpm}
              rpmEnabled={rpmEnabled}
              icdOverride={icdOverride}
              onIcdOverride={onIcdOverride}
              onRpmToggle={onRpmToggle}
              readOnly={readOnly}
            />
          </div>
        </aside>
      </div>

      <VersionHistoryDrawer
        open={versionsOpen}
        onClose={() => onVersionsOpenChange?.(false)}
        versions={versions}
        readOnly={readOnly}
        restoring={soapProps.panel?.saving}
        onRestore={onRestoreVersion}
        onCompare={handleCompare}
      />

      <AuditTrailDrawer open={auditOpen} onClose={() => onAuditOpenChange?.(false)} sessionId={sessionId} />
    </div>
  );
}
