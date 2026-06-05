"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const SOAP_AVAILABLE_STATUSES = new Set([
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
  "SOAP_APPROVED",
  "READY_FOR_PRESCRIPTION",
  "GENERATING_PRESCRIPTION",
  "PRESCRIPTION_DRAFT_READY",
  "PRESCRIPTION_REVIEW_REQUIRED",
  "PRESCRIPTION_REVIEWING",
  "PRESCRIPTION_APPROVED",
  "COMPLETED",
]);

export { SOAP_AVAILABLE_STATUSES };

const SOAP_SECTIONS = [
  { key: "subjective", label: "Subjective" },
  { key: "objective", label: "Objective" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

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
  onApprove,
  canApprove,
  generating,
  hasChanges,
}) {
  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="text-sm text-rose-600">{error.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
      </div>
    );
  }

  const disabled = readOnly || saving || generating;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="soap-review-workspace">
      {generating && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Updating note…
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {SOAP_SECTIONS.map(({ key, label }) => (
          <div key={key}>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              {label}
              {dirty[key] && <span className="ml-2 normal-case text-indigo-600">edited</span>}
            </label>
            {disabled && !generating ? (
              <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                {draft[key] || "—"}
              </p>
            ) : (
              <Textarea
                value={draft[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                disabled={disabled}
                rows={3}
                placeholder={`${label}…`}
                className="min-h-0 resize-none text-sm"
              />
            )}
          </div>
        ))}
      </div>

      {canApprove && !readOnly && (
        <div className="shrink-0 border-t border-slate-100 p-4">
          <Button
            className="w-full gap-2 bg-slate-900 hover:bg-slate-800"
            size="sm"
            data-testid="soap-approve"
            onClick={onApprove}
            disabled={saving || hasChanges || generating}
          >
            <CheckCircle2 className="h-4 w-4" />
            Approve note
          </Button>
        </div>
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
