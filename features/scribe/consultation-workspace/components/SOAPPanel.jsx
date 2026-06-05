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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  { key: "subjective", letter: "S", label: "Subjective", color: "bg-blue-500" },
  { key: "objective", letter: "O", label: "Objective", color: "bg-emerald-500" },
  { key: "assessment", letter: "A", label: "Assessment", color: "bg-amber-500" },
  { key: "plan", letter: "P", label: "Plan", color: "bg-violet-500" },
];

export function SOAPEmptyPanel({
  sessionStatus,
  generating,
  canGenerate,
  onGenerate,
  confidence,
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/10 lg:w-[380px] shrink-0">
      <PanelHeader confidence={confidence} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        {generating ? (
          <>
            <Loader2 className="size-10 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Generating SOAP note from transcript…</p>
          </>
        ) : (
          <>
            <div className="rounded-full bg-primary/10 p-5">
              <Sparkles className="size-8 text-primary" />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="text-sm font-semibold">AI Generated Note</p>
              <p className="text-xs text-muted-foreground">
                {sessionStatus === "REVIEWING"
                  ? "Complete transcript review, then generate your clinical note."
                  : canGenerate
                    ? "Ready to generate SOAP from the conversation."
                    : "SOAP note will appear here after transcription."}
              </p>
            </div>
            {canGenerate && (
              <Button onClick={onGenerate} data-testid="scribe-generate-soap-inline" className="gap-2">
                <Sparkles className="size-4" />
                Generate SOAP
              </Button>
            )}
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
      <div className="flex min-h-0 flex-1 flex-col bg-muted/10 lg:w-[380px] shrink-0">
        <PanelHeader confidence={confidence} />
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" />
          Loading SOAP note…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-muted/10 lg:w-[380px] shrink-0">
        <PanelHeader confidence={confidence} />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm text-destructive">{error.message}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      </div>
    );
  }

  const disabled = readOnly || saving;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-muted/10 lg:w-[380px] shrink-0"
      data-testid="soap-review-workspace"
    >
      <PanelHeader confidence={confidence} />

      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b px-3 pt-2">
          <TabsList className="w-full h-8 bg-transparent p-0 gap-0">
            {[
              ["soap", "SOAP Note"],
              ["summary", "Summary"],
              ["prescription", "Prescription"],
              ["followup", "Follow-up Plan"],
            ].map(([value, label]) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex-1 text-[10px] h-7 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <TabsContent value="soap" className="mt-0 p-3 space-y-3">
            {SOAP_CORE.map(({ key, letter, label, color }) => (
              <SOAPCard
                key={key}
                letter={letter}
                label={label}
                color={color}
                value={draft[key]}
                dirty={Boolean(dirty[key])}
                disabled={disabled}
                editing={editingSection === key}
                onEdit={() => setEditingSection(key)}
                onChange={(v) => onChange(key, v)}
              />
            ))}
          </TabsContent>

          <TabsContent value="summary" className="mt-0 p-3 space-y-3">
            <SOAPCard
              letter="C"
              label="Chief Complaint"
              color="bg-slate-500"
              value={draft.chiefComplaint}
              dirty={Boolean(dirty.chiefComplaint)}
              disabled={disabled}
              editing={editingSection === "chiefComplaint"}
              onEdit={() => setEditingSection("chiefComplaint")}
              onChange={(v) => onChange("chiefComplaint", v)}
            />
            <SOAPCard
              letter="H"
              label="History of Present Illness"
              color="bg-slate-500"
              value={draft.historyOfPresentIllness}
              dirty={Boolean(dirty.historyOfPresentIllness)}
              disabled={disabled}
              editing={editingSection === "historyOfPresentIllness"}
              onEdit={() => setEditingSection("historyOfPresentIllness")}
              onChange={(v) => onChange("historyOfPresentIllness", v)}
            />
            <SOAPCard
              letter="Σ"
              label="Clinical Summary"
              color="bg-primary"
              value={draft.clinicalSummary}
              dirty={Boolean(dirty.clinicalSummary)}
              disabled={disabled}
              editing={editingSection === "clinicalSummary"}
              onEdit={() => setEditingSection("clinicalSummary")}
              onChange={(v) => onChange("clinicalSummary", v)}
            />
          </TabsContent>

          <TabsContent value="prescription" className="mt-0 p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Approve the SOAP note first, then generate a prescription from the main Scribe page.
            </p>
          </TabsContent>

          <TabsContent value="followup" className="mt-0 p-3">
            <SOAPCard
              letter="F"
              label="Follow-up Plan"
              color="bg-violet-500"
              value={draft.plan}
              dirty={Boolean(dirty.plan)}
              disabled={disabled}
              editing={editingSection === "plan_followup"}
              onEdit={() => setEditingSection("plan_followup")}
              onChange={(v) => onChange("plan", v)}
            />
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {!readOnly && (
        <div className="shrink-0 border-t bg-background p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 flex-1"
              onClick={onRegenerate}
              disabled={saving || generating}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", generating && "animate-spin")} />
              Regenerate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 flex-1"
              onClick={onSave}
              disabled={saving || !hasChanges}
            >
              <Pencil className="h-3.5 w-3.5" />
              Save edits
            </Button>
            {canApprove && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5 flex-1"
                data-testid="soap-approve"
                onClick={onApprove}
                disabled={saving || hasChanges}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Approve Note
                <ChevronDown className="h-3 w-3 opacity-70" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" disabled>
              Export PDF
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-[10px] flex-1" disabled>
              Send to EMR
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" disabled>
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelHeader({ confidence }) {
  return (
    <div className="shrink-0 flex items-center justify-between border-b px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold">AI Generated Note</h3>
        <p className="text-xs text-muted-foreground mt-0.5">Clinical documentation</p>
      </div>
      {confidence != null && (
        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 border-emerald-500/30">
          Confidence: {confidence}%
        </Badge>
      )}
    </div>
  );
}

function SOAPCard({ letter, label, color, value, dirty, disabled, editing, onEdit, onChange }) {
  const isEditing = editing && !disabled;

  return (
    <div className="rounded-xl border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <span className={cn("flex h-6 w-6 items-center justify-center rounded-md text-white text-xs font-bold", color)}>
            {letter}
          </span>
          <span className="text-xs font-semibold">{label}</span>
          {dirty && <span className="text-[9px] text-primary">· unsaved</span>}
        </div>
        {!disabled && (
          <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      <div className="p-3">
        {isEditing || !value ? (
          <Textarea
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={4}
            placeholder={`Enter ${label.toLowerCase()}…`}
            className="min-h-0 resize-none text-sm leading-relaxed border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            autoFocus={isEditing}
          />
        ) : (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{value}</p>
        )}
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
