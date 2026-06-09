"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  RefreshCw,
  Save,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { CORE_SOAP_SECTIONS, getSoapClinicalWarnings, hasBlockingSoapWarnings } from "../lib/clinical-safety.js";
import { SOAPVersionPanel } from "./SOAPVersionPanel.jsx";

const SECONDARY_SECTIONS = [
  ["chiefComplaint", "Chief Complaint"],
  ["historyOfPresentIllness", "History of Present Illness"],
  ["clinicalSummary", "Clinical Summary"],
];

import { SOAP_AVAILABLE_STATUSES } from "../lib/soap-availability.js";

export { SOAP_AVAILABLE_STATUSES };

export function SOAPEmptyPanel({ generating, error, onRetry }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        {error ? (
          <>
            <p className="text-sm text-rose-600">{error.message}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
            )}
          </>
        ) : generating ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <p className="text-sm text-slate-600">Generating SOAP note…</p>
          </>
        ) : (
          <p className="text-sm text-slate-500">SOAP note will generate after recording.</p>
        )}
      </div>
    </div>
  );
}

export function SOAPEditorPanel({
  draft,
  dirty,
  readOnly,
  saving,
  error,
  onChange,
  onRetry,
  onSave,
  onApprove,
  onReject,
  onRegenerate,
  onExport,
  onRestoreVersion,
  versions,
  canApprove,
  canExport,
  canRegenerate,
  generating,
  regenerating,
  exporting,
  autosaveStatus,
  activeSection,
  onSectionFocus,
}) {
  const [exportError, setExportError] = useState(null);
  const [showSecondary, setShowSecondary] = useState(false);

  const warnings = useMemo(() => getSoapClinicalWarnings(draft), [draft]);
  const blocking = hasBlockingSoapWarnings(warnings);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-rose-600">{error.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  const disabled = readOnly || saving || generating || regenerating;
  const hasDirty = Object.keys(dirty).length > 0;

  const handleExport = async () => {
    setExportError(null);
    try {
      await onExport?.();
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleApprove = async () => {
    if (hasDirty) {
      const ok = window.confirm("You have unsaved SOAP changes. Save and approve?");
      if (!ok) return;
      await onSave?.();
    }
    if (blocking) {
      window.alert("Assessment and Plan are required before approval.");
      return;
    }
    await onApprove?.();
  };

  const handleReject = async () => {
    if (hasDirty) {
      const ok = window.confirm("You have unsaved changes. Reject anyway?");
      if (!ok) return;
    }
    const reason = window.prompt("Reason for rejecting this SOAP note:");
    if (!reason?.trim()) return;
    await onReject?.(reason.trim());
  };

  const handleRegenerate = async () => {
    if (hasDirty) {
      const ok = window.confirm("Unsaved edits will be saved before regenerating. Continue?");
      if (!ok) return;
    }
    await onRegenerate?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="soap-review-workspace">
      {(generating || regenerating || autosaveStatus === "saving") && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {regenerating ? "Regenerating SOAP…" : generating ? "Generating…" : "Saving…"}
        </div>
      )}

      {warnings.length > 0 && !readOnly && (
        <div className="shrink-0 space-y-1 border-b border-amber-100 bg-amber-50/80 px-4 py-2">
          {warnings.map((w) => (
            <p
              key={w.key}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                w.severity === "error" ? "text-rose-700" : "text-amber-800",
              )}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {w.message}
            </p>
          ))}
        </div>
      )}

      {autosaveStatus === "saved" && !hasDirty && (
        <div className="shrink-0 border-b border-slate-100 px-4 py-1.5 text-xs text-emerald-600">
          All changes saved
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {CORE_SOAP_SECTIONS.map(([key, label]) => (
          <SoapSectionField
            key={key}
            sectionKey={key}
            label={label}
            value={draft[key]}
            dirty={dirty[key]}
            disabled={disabled}
            active={activeSection === key}
            emptyWarning={!String(draft[key] ?? "").trim()}
            onChange={onChange}
            onFocus={() => onSectionFocus?.(key)}
          />
        ))}

        <button
          type="button"
          onClick={() => setShowSecondary((v) => !v)}
          className="flex w-full items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          {showSecondary ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showSecondary ? "Hide" : "Show"} additional sections
        </button>

        {showSecondary &&
          SECONDARY_SECTIONS.map(([key, label]) => (
            <SoapSectionField
              key={key}
              sectionKey={key}
              label={label}
              value={draft[key]}
              dirty={dirty[key]}
              disabled={disabled}
              active={activeSection === key}
              onChange={onChange}
              onFocus={() => onSectionFocus?.(key)}
            />
          ))}
      </div>

      <SOAPVersionPanel
        versions={versions}
        readOnly={readOnly}
        restoring={saving}
        onRestore={onRestoreVersion}
      />

      {!readOnly && (
        <div className="shrink-0 space-y-2 border-t border-slate-100 p-4">
          {exportError && <p className="text-xs text-rose-600">{exportError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 gap-1.5 min-w-[100px]"
              onClick={onSave}
              disabled={saving || generating || regenerating || !hasDirty}
            >
              <Save className="h-3.5 w-3.5" />
              Save
            </Button>
            {canRegenerate && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 min-w-[100px]"
                onClick={handleRegenerate}
                disabled={saving || generating || regenerating}
              >
                <RefreshCw className={cn("h-3.5 w-3.5", regenerating && "animate-spin")} />
                Regenerate
              </Button>
            )}
            {canExport && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 min-w-[100px]"
                onClick={handleExport}
                disabled={exporting || generating || hasDirty}
                data-testid="soap-export-pdf"
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Export
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {canApprove && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50"
                  onClick={handleReject}
                  disabled={saving || generating || regenerating}
                  data-testid="soap-reject"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </Button>
                <Button
                  className="flex-1 gap-2 bg-slate-900 hover:bg-slate-800"
                  size="sm"
                  data-testid="soap-approve"
                  onClick={handleApprove}
                  disabled={saving || generating || regenerating || hasDirty || blocking}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Approve
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {readOnly && canExport && (
        <div className="shrink-0 border-t border-slate-100 p-4">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1.5"
            onClick={handleExport}
            disabled={exporting}
            data-testid="soap-export-pdf"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export PDF
          </Button>
        </div>
      )}
    </div>
  );
}

function SoapSectionField({
  sectionKey,
  label,
  value,
  dirty,
  disabled,
  active,
  emptyWarning,
  onChange,
  onFocus,
}) {
  return (
    <div
      id={`soap-section-${sectionKey}`}
      className={cn(
        "scroll-mt-4 rounded-lg transition-colors",
        active && "bg-indigo-50/40 ring-1 ring-indigo-200",
        emptyWarning && !disabled && "ring-1 ring-amber-200/80",
      )}
    >
      <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
        {dirty && <span className="normal-case text-indigo-600">· unsaved</span>}
        {emptyWarning && !disabled && (
          <span className="normal-case font-normal text-amber-700">· empty</span>
        )}
      </label>
      {disabled ? (
        <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
          {value || "—"}
        </p>
      ) : (
        <Textarea
          value={value ?? ""}
          onChange={(e) => onChange(sectionKey, e.target.value)}
          onFocus={onFocus}
          disabled={disabled}
          rows={sectionKey === "plan" || sectionKey === "assessment" ? 4 : 3}
          placeholder={`${label}…`}
          className="min-h-0 resize-y text-sm"
        />
      )}
    </div>
  );
}

export function computeTranscriptConfidence(segments) {
  if (!segments?.length) return null;
  const withConf = segments.filter((s) => typeof s.confidence === "number");
  if (!withConf.length) return null;
  const avg = withConf.reduce((sum, s) => sum + s.confidence, 0) / withConf.length;
  return Math.round(avg * 100);
}
