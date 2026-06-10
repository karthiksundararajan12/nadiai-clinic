"use client";

import { useCallback, useState } from "react";
import {
  CheckCircle,
  Download,
  FileText,
  History,
  Loader2,
  MoreHorizontal,
  Shield,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatClinicalDateTime, resolveSoapDateLabel } from "../../lib/format-datetime.js";
import { SOAPEditor, SOAPEditorEmpty } from "../consultation/SOAPEditor.jsx";
import { ApprovedStatusBadge } from "../consultation/PrescriptionPreview.jsx";
import { VersionHistoryDrawer } from "./VersionHistoryDrawer.jsx";
import { AuditTrailDrawer } from "./AuditTrailDrawer.jsx";
import { SoapReviewModal } from "./SoapReviewModal.jsx";
import { SoapFeedbackModal } from "./SoapFeedbackModal.jsx";
import { SoapManualEditBar } from "./SoapManualEditBar.jsx";
import { SoapRegeneratingOverlay } from "./SoapRegeneratingOverlay.jsx";

export function ConsultationClinicalLayout({
  sessionId,
  sessionDate,
  sessionDateLabel = "Generated",
  status,
  quality,
  evidenceMap,
  soapProps,
  readOnly,
  soapApproved,
  toolbarLeft,
  onOpenSessions,
  versions,
  onRestoreVersion,
  onCompareVersions,
  onEvidenceJump: externalEvidenceJump,
  versionsOpen,
  onVersionsOpenChange,
  auditOpen,
  onAuditOpenChange,
  canApprove,
  approving,
  onApprove,
  onExport,
  exporting,
  onOpenVersions,
  onOpenAudit,
  onOpenSoapReview,
  reviewModalOpen,
  onReviewModalOpenChange,
  onRegenerateFromReview,
  onEditManuallyFromReview,
  manualEditMode,
  onSaveManualEdits,
  onCancelManualEdit,
  feedbackModalOpen,
  onFeedbackModalOpenChange,
  onSubmitFeedback,
  feedbackSubmitting,
  soapNoteStatus,
  soapDoctorEditedAt,
  canGeneratePrescription,
  generatingPrescription,
  onGeneratePrescription,
  prescriptionReady,
  onViewPrescription,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

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

  const approved =
    soapApproved ||
    status === "SOAP_APPROVED" ||
    status === "COMPLETED" ||
    status === "READY_FOR_PRESCRIPTION";

  const formattedDate = formatClinicalDateTime(sessionDate);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="consultation-workspace">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900">SOAP Note</h2>
            {formattedDate && (
              <p className="text-xs text-gray-500">
                {sessionDateLabel} {formattedDate}
              </p>
            )}
          </div>
          {toolbarLeft}
        </div>
        <div className="flex items-center gap-2">
          <ApprovedStatusBadge approved={approved} />
          {soapNoteStatus === "edited" && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
              Edited by Doctor
              {soapDoctorEditedAt && (
                <span className="ml-1 font-normal text-amber-700">
                  · {new Date(soapDoctorEditedAt).toLocaleString()}
                </span>
              )}
            </span>
          )}
          {soapNoteStatus === "regenerated" && !approved && (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800">
              Regenerated
            </span>
          )}
          {canApprove && (
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:bg-cyan-700 disabled:opacity-50"
              onClick={onApprove}
              disabled={approving}
              data-testid="soap-approve"
            >
              {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              Approve
            </button>
          )}
          {approved && canGeneratePrescription && (
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:bg-green-700 disabled:opacity-50"
              onClick={onGeneratePrescription}
              disabled={generatingPrescription}
              data-testid="generate-prescription"
            >
              {generatingPrescription ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Generate Prescription
            </button>
          )}
          {approved && prescriptionReady && (
            <button
              type="button"
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50"
              onClick={onViewPrescription}
            >
              <FileText className="h-4 w-4" />
              View Prescription
            </button>
          )}
          <button
            type="button"
            className="cursor-pointer rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50"
            onClick={onOpenSessions}
          >
            Sessions
          </button>
          <div className="relative">
            <button
              type="button"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-gray-200 transition-all duration-200 hover:bg-gray-50"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
            {menuOpen && (
              <>
                <button type="button" className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-label="Close" />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <MenuItem
                    icon={Download}
                    label="Export PDF"
                    onClick={() => { setMenuOpen(false); onExport?.(); }}
                    testId="soap-export-pdf"
                    loading={exporting}
                  />
                  <MenuItem icon={History} label="Version History" onClick={() => { setMenuOpen(false); onOpenVersions?.(); }} />
                  <MenuItem icon={Shield} label="Audit Trail" onClick={() => { setMenuOpen(false); onOpenAudit?.(); }} />
                  {canApprove && (
                    <MenuItem
                      icon={XCircle}
                      label="Reject SOAP"
                      destructive
                      onClick={() => {
                        setMenuOpen(false);
                        onOpenSoapReview?.();
                      }}
                      testId="soap-reject"
                    />
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
        <SoapRegeneratingOverlay visible={soapProps.panel?.regenerating} />
        <div className="mx-auto max-w-3xl">
          {manualEditMode && (
            <SoapManualEditBar
              saving={soapProps.panel?.saving}
              onSave={onSaveManualEdits}
              onCancel={onCancelManualEdit}
            />
          )}
          {soapProps.ready ? (
            <SOAPEditor
              {...soapProps.panel}
              quality={approved || manualEditMode ? null : quality}
              evidenceMap={evidenceMap}
              onEvidenceJump={handleEvidenceJump}
              onRegenerate={soapProps.panel.onRegenerate}
            />
          ) : (
            <SOAPEditorEmpty {...soapProps.empty} />
          )}
        </div>
      </div>

      <SoapReviewModal
        open={reviewModalOpen}
        onOpenChange={onReviewModalOpenChange}
        onRegenerate={onRegenerateFromReview}
        onEditManually={onEditManuallyFromReview}
      />
      <SoapFeedbackModal
        open={feedbackModalOpen}
        onOpenChange={onFeedbackModalOpenChange}
        onSubmit={onSubmitFeedback}
        submitting={feedbackSubmitting}
      />

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

function MenuItem({ icon: Icon, label, onClick, destructive, testId, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-all duration-200 hover:bg-gray-50",
        destructive ? "text-red-600" : "text-gray-700",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
