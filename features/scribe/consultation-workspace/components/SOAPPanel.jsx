"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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

const SOAP_CORE = [
  { key: "subjective", letter: "S", label: "Subjective", tone: "bg-indigo-600" },
  { key: "objective", letter: "O", label: "Objective", tone: "bg-teal-600" },
  { key: "assessment", letter: "A", label: "Assessment", tone: "bg-violet-600" },
  { key: "plan", letter: "P", label: "Plan", tone: "bg-amber-600" },
];

const TABS = [
  ["soap", "SOAP Note"],
  ["summary", "Summary"],
  ["prescription", "Prescription"],
  ["followup", "Follow-up"],
];

export function SOAPEmptyPanel({
  sessionStatus,
  generating,
  canGenerate,
  onGenerate,
  confidence,
  onCompleteReview,
  canCompleteReview,
  completeReviewDisabled,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHeader confidence={confidence} />
      <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 py-12 text-center">
        {generating ? (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            <p className="text-[14px] text-slate-600">Generating clinical note…</p>
          </>
        ) : (
          <>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 ring-1 ring-indigo-100">
              <Sparkles className="h-7 w-7 text-indigo-500" />
            </div>
            <div className="max-w-[260px] space-y-1.5">
              <p className="text-[15px] font-semibold text-slate-900">AI note pending</p>
              <p className="text-[13px] leading-relaxed text-slate-500">
                {sessionStatus === "REVIEWING"
                  ? "Review the transcript, then complete review to unlock note generation."
                  : canGenerate
                    ? "Transcript is ready. Generate a structured SOAP note."
                    : "Your clinical note will appear here after transcription."}
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-[220px]">
              {canCompleteReview && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="scribe-complete-review"
                  onClick={onCompleteReview}
                  disabled={completeReviewDisabled}
                  className="h-9"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Complete review
                </Button>
              )}
              {canGenerate && (
                <Button
                  size="sm"
                  data-testid="scribe-generate-soap"
                  onClick={onGenerate}
                  className="h-9 bg-slate-900 hover:bg-slate-800"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate SOAP
                </Button>
              )}
            </div>
          </>
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
  loading,
  error,
  onChange,
  onRetry,
  confidence,
  onRegenerate,
  onApprove,
  onSave,
  canApprove,
  generating,
  hasChanges,
}) {
  const [tab, setTab] = useState("soap");
  const [editingSection, setEditingSection] = useState(null);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader confidence={confidence} />
        <div className="flex flex-1 items-center justify-center text-[13px] text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading note…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <PanelHeader confidence={confidence} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-[13px] text-rose-600">{error.message}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      </div>
    );
  }

  const disabled = readOnly || saving;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="soap-review-workspace">
      <PanelHeader confidence={confidence} />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-slate-100 px-4">
          <TabsList className="h-10 w-full justify-start gap-0 rounded-none bg-transparent p-0">
            {TABS.map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="rounded-none border-b-2 border-transparent px-3 pb-2.5 pt-2 text-[12px] font-medium text-slate-500 data-[state=active]:border-slate-900 data-[state=active]:bg-transparent data-[state=active]:text-slate-900 data-[state=active]:shadow-none"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <TabsContent value="soap" className="mt-0 space-y-3 p-4">
            {SOAP_CORE.map((section) => (
              <SOAPCard
                key={section.key}
                {...section}
                value={draft[section.key]}
                dirty={Boolean(dirty[section.key])}
                disabled={disabled}
                editing={editingSection === section.key}
                onEdit={() => setEditingSection(section.key)}
                onChange={(v) => onChange(section.key, v)}
              />
            ))}
          </TabsContent>

          <TabsContent value="summary" className="mt-0 space-y-3 p-4">
            <SOAPCard letter="C" label="Chief complaint" tone="bg-slate-600" value={draft.chiefComplaint} dirty={Boolean(dirty.chiefComplaint)} disabled={disabled} editing={editingSection === "chiefComplaint"} onEdit={() => setEditingSection("chiefComplaint")} onChange={(v) => onChange("chiefComplaint", v)} />
            <SOAPCard letter="H" label="History of present illness" tone="bg-slate-600" value={draft.historyOfPresentIllness} dirty={Boolean(dirty.historyOfPresentIllness)} disabled={disabled} editing={editingSection === "historyOfPresentIllness"} onEdit={() => setEditingSection("historyOfPresentIllness")} onChange={(v) => onChange("historyOfPresentIllness", v)} />
            <SOAPCard letter="Σ" label="Clinical summary" tone="bg-indigo-600" value={draft.clinicalSummary} dirty={Boolean(dirty.clinicalSummary)} disabled={disabled} editing={editingSection === "clinicalSummary"} onEdit={() => setEditingSection("clinicalSummary")} onChange={(v) => onChange("clinicalSummary", v)} />
          </TabsContent>

          <TabsContent value="prescription" className="mt-0 p-8 text-center">
            <p className="text-[13px] leading-relaxed text-slate-500">
              Approve the SOAP note to unlock prescription generation.
            </p>
          </TabsContent>

          <TabsContent value="followup" className="mt-0 p-4">
            <SOAPCard letter="F" label="Follow-up plan" tone="bg-violet-600" value={draft.plan} dirty={Boolean(dirty.plan)} disabled={disabled} editing={editingSection === "plan"} onEdit={() => setEditingSection("plan")} onChange={(v) => onChange("plan", v)} />
          </TabsContent>
        </div>
      </Tabs>

      {!readOnly && (
        <NoteActions
          onRegenerate={onRegenerate}
          onSave={onSave}
          onApprove={onApprove}
          canApprove={canApprove}
          saving={saving}
          generating={generating}
          hasChanges={hasChanges}
        />
      )}
    </div>
  );
}

function PanelHeader({ confidence }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">AI Generated Note</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">Structured clinical documentation</p>
      </div>
      {confidence != null && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
          <Sparkles className="h-3 w-3" />
          {confidence}%
        </span>
      )}
    </div>
  );
}

function SOAPCard({ letter, label, tone, value, dirty, disabled, editing, onEdit, onChange }) {
  const isEditing = editing && !disabled;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg text-[12px] font-bold text-white", tone)}>
            {letter}
          </span>
          <span className="text-[13px] font-semibold text-slate-800">{label}</span>
          {dirty && <span className="text-[10px] font-medium text-indigo-600">Unsaved</span>}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
      </div>
      <div className="px-4 py-3.5">
        {isEditing || !value ? (
          <Textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder={`Enter ${label.toLowerCase()}…`}
            className="min-h-0 resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
            autoFocus={isEditing}
          />
        ) : (
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{value}</p>
        )}
      </div>
    </div>
  );
}

function NoteActions({ onRegenerate, onSave, onApprove, canApprove, saving, generating, hasChanges }) {
  return (
    <div className="shrink-0 space-y-2 border-t border-slate-200/80 bg-white p-4">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex-1 gap-1.5 border-slate-200 text-[12px]"
          onClick={onRegenerate}
          disabled={saving || generating}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", generating && "animate-spin")} />
          Regenerate
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 flex-1 gap-1.5 border-slate-200 text-[12px]"
          onClick={onSave}
          disabled={saving || !hasChanges}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit manually
        </Button>
        {canApprove && (
          <Button
            size="sm"
            className="h-9 flex-[1.2] gap-1.5 bg-slate-900 text-[12px] hover:bg-slate-800"
            data-testid="soap-approve"
            onClick={onApprove}
            disabled={saving || hasChanges}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approve note
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="h-8 flex-1 text-[11px] text-slate-500" disabled>
          Export PDF
        </Button>
        <Button variant="outline" size="sm" className="h-8 flex-1 text-[11px] text-slate-500" disabled>
          Send to EMR
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled>
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </div>
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
