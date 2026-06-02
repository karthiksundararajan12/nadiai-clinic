"use client";

/**
 * PrescriptionReviewWorkspace
 *
 * Full inline-editing workspace for doctor review of AI-generated prescription drafts.
 *
 * Features:
 *  - Inline editing of every prescription field
 *  - Autosave with 2-second debounce
 *  - Manual save (immutable version snapshot)
 *  - Version history panel with revert
 *  - Safety highlighting: low-confidence meds, missing dosage/freq/duration
 *  - Approve / Reject / Request Regeneration workflow
 *  - Warnings panel
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────
// SAFETY HELPERS
// ─────────────────────────────────────────────────────────────

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const UNSPECIFIED               = "Not specified";

/** Returns a set of safety flag strings for a medication. */
function getMedSafetyFlags(med) {
  const flags = new Set();
  if ((med.confidence ?? 1) < LOW_CONFIDENCE_THRESHOLD) flags.add("lowConfidence");
  if (!med.dosage    || med.dosage    === UNSPECIFIED)   flags.add("missingDosage");
  if (!med.frequency || med.frequency === UNSPECIFIED)   flags.add("missingFrequency");
  if (!med.duration  || med.duration  === UNSPECIFIED)   flags.add("missingDuration");
  return flags;
}

// ─────────────────────────────────────────────────────────────
// STATUS BADGE
// ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const config = {
    PRESCRIPTION_DRAFT_READY:     { label: "Draft Ready",    className: "bg-blue-100 text-blue-800" },
    PRESCRIPTION_REVIEW_REQUIRED: { label: "Review Required", className: "bg-amber-100 text-amber-800" },
    PRESCRIPTION_REVIEWING:       { label: "Reviewing",       className: "bg-violet-100 text-violet-800" },
    PRESCRIPTION_APPROVED:        { label: "Approved",        className: "bg-green-100 text-green-800" },
  };
  const cfg = config[status] ?? { label: status?.replace(/_/g, " ") ?? "—", className: "bg-muted text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// INLINE EDITABLE ARRAY (for string[] fields like diagnosis, advice, etc.)
// ─────────────────────────────────────────────────────────────

function EditableStringArray({ label, items, onChange, readonly, placeholder }) {
  const [localItems, setLocalItems] = useState(items ?? []);

  useEffect(() => {
    setLocalItems(items ?? []);
  }, [JSON.stringify(items)]);

  const commit = (next) => {
    setLocalItems(next);
    onChange(next);
  };

  const update  = (i, val) => commit(localItems.map((v, idx) => (idx === i ? val : v)));
  const remove  = (i)      => commit(localItems.filter((_, idx) => idx !== i));
  const addItem = ()       => commit([...localItems, ""]);

  return (
    <div className="space-y-1.5">
      {localItems.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(e) => update(i, e.target.value)}
            onBlur={(e) => update(i, e.target.value)}
            placeholder={placeholder ?? `${label} ${i + 1}`}
            disabled={readonly}
            className="flex-1 text-sm h-8"
          />
          {!readonly && (
            <button
              onClick={() => remove(i)}
              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {!readonly && (
        <button
          onClick={addItem}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-1"
        >
          <Plus className="h-3 w-3" />
          Add {label}
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MEDICATION CARD
// ─────────────────────────────────────────────────────────────

function MedicationCard({ med, index, onChange, onRemove, readonly }) {
  const flags       = getMedSafetyFlags(med);
  const hasSafetyFlag = flags.size > 0;
  const [isExpanded, setIsExpanded] = useState(true);

  const field = (key) => (val) => onChange(index, { ...med, [key]: val });

  return (
    <div
      className={cn(
        "rounded-lg border p-4 space-y-3 transition-colors",
        hasSafetyFlag ? "border-amber-300 bg-amber-50/40" : "border-border bg-card",
      )}
    >
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              value={med.name ?? ""}
              onChange={(e) => field("name")(e.target.value)}
              placeholder="Medication name"
              disabled={readonly}
              className="h-7 text-sm font-medium w-56 px-2"
            />
            {/* Confidence badge */}
            {typeof med.confidence === "number" && (
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full font-medium",
                  med.confidence >= LOW_CONFIDENCE_THRESHOLD
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700",
                )}
                title="AI confidence score"
              >
                {Math.round(med.confidence * 100)}%
              </span>
            )}
            {/* Safety flags */}
            {flags.has("lowConfidence") && (
              <SafetyPill label="Low confidence" />
            )}
            {flags.has("missingDosage") && (
              <SafetyPill label="No dosage" />
            )}
            {flags.has("missingFrequency") && (
              <SafetyPill label="No frequency" />
            )}
            {flags.has("missingDuration") && (
              <SafetyPill label="No duration" />
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setIsExpanded((x) => !x)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {!readonly && (
            <button
              onClick={() => onRemove(index)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Remove medication"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {/* Dosage */}
          <LabeledField
            label="Dosage"
            highlight={flags.has("missingDosage")}
            required
          >
            <Input
              value={med.dosage ?? ""}
              onChange={(e) => field("dosage")(e.target.value)}
              placeholder="e.g. 500 mg"
              disabled={readonly}
              className="h-7 text-sm"
            />
          </LabeledField>

          {/* Frequency */}
          <LabeledField
            label="Frequency"
            highlight={flags.has("missingFrequency")}
            required
          >
            <Input
              value={med.frequency ?? ""}
              onChange={(e) => field("frequency")(e.target.value)}
              placeholder="e.g. Twice daily"
              disabled={readonly}
              className="h-7 text-sm"
            />
          </LabeledField>

          {/* Duration */}
          <LabeledField
            label="Duration"
            highlight={flags.has("missingDuration")}
            required
          >
            <Input
              value={med.duration ?? ""}
              onChange={(e) => field("duration")(e.target.value)}
              placeholder="e.g. 5 days"
              disabled={readonly}
              className="h-7 text-sm"
            />
          </LabeledField>

          {/* Instructions */}
          <LabeledField label="Instructions" className="sm:col-span-3">
            <Input
              value={med.instructions ?? ""}
              onChange={(e) => field("instructions")(e.target.value)}
              placeholder="e.g. After meals"
              disabled={readonly}
              className="h-7 text-sm"
            />
          </LabeledField>
        </div>
      )}
    </div>
  );
}

function SafetyPill({ label }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 font-medium">
      <AlertTriangle className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function LabeledField({ label, highlight, required, className, children }) {
  return (
    <div className={cn("space-y-1", className)}>
      <label className={cn("text-xs font-medium", highlight ? "text-amber-700" : "text-muted-foreground")}>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
        {highlight && <AlertTriangle className="inline h-2.5 w-2.5 ml-1 text-amber-600" />}
      </label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// VERSION HISTORY PANEL
// ─────────────────────────────────────────────────────────────

function VersionHistoryPanel({ versions, onRevert, readonly }) {
  if (!versions?.length) {
    return (
      <div className="text-sm text-muted-foreground py-4 text-center">
        No saved versions yet. Click &quot;Save Version&quot; to create a snapshot.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((v) => {
        const date = new Date(v.created_at).toLocaleString(undefined, {
          month: "short", day: "numeric",
          hour: "2-digit", minute: "2-digit",
        });
        return (
          <div
            key={v.id}
            className="flex items-center justify-between rounded-lg border px-3 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-xs text-muted-foreground font-mono">
                  v{v.version_number}
                </span>
                <span className="text-xs text-muted-foreground">{date}</span>
              </div>
              {v.generation_metadata?.label && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {v.generation_metadata.label}
                </p>
              )}
            </div>
            {!readonly && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 h-7 text-xs gap-1"
                onClick={() => onRevert(v)}
              >
                <RotateCcw className="h-3 w-3" />
                Revert
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// REJECT MODAL
// ─────────────────────────────────────────────────────────────

function RejectModal({ open, onClose, onConfirm, isLoading }) {
  const [reason,     setReason]     = useState("");
  const [regenerate, setRegenerate] = useState(false);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <XCircle className="h-5 w-5 text-destructive shrink-0" />
          <h2 className="text-base font-semibold">Reject Prescription</h2>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Reason for rejection</label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why the prescription is being rejected…"
            rows={3}
            className="text-sm resize-none"
          />
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={regenerate}
            onChange={(e) => setRegenerate(e.target.checked)}
            className="rounded"
          />
          <span className="text-sm">Request AI regeneration (resets to SOAP Approved)</span>
        </label>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onConfirm(reason, regenerate)}
            disabled={!reason.trim() || isLoading}
            className="gap-1.5"
          >
            {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Reject
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN WORKSPACE COMPONENT
// ─────────────────────────────────────────────────────────────

export function PrescriptionReviewWorkspace({ sessionId, onApproved }) {
  const [workspace,      setWorkspace]      = useState(null);
  const [draft,          setDraft]          = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [isDirty,        setIsDirty]        = useState(false);
  const [isSaving,       setIsSaving]       = useState(false);
  const [isApproving,    setIsApproving]    = useState(false);
  const [isRejecting,    setIsRejecting]    = useState(false);
  const [actionError,    setActionError]    = useState(null);
  const [showVersions,   setShowVersions]   = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [lastSavedAt,    setLastSavedAt]    = useState(null);

  const autosaveTimer = useRef(null);
  const latestDraft   = useRef(null);

  // Keep latestDraft ref in sync for the autosave closure
  useEffect(() => { latestDraft.current = draft; }, [draft]);

  // ── Load workspace ───────────────────────────────────────────────────────
  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res     = await fetch(`/api/scribe/sessions/${sessionId}/prescription/review`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Failed to load workspace (${res.status})`);
      setWorkspace(payload);
      setDraft(payload.draft?.draft ?? null);
      setIsDirty(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => { loadWorkspace(); }, [loadWorkspace]);

  // ── Autosave ─────────────────────────────────────────────────────────────
  const scheduleAutosave = useCallback(() => {
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(async () => {
      if (!latestDraft.current || !isDirty) return;
      try {
        await fetch(`/api/scribe/sessions/${sessionId}/prescription/review`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ draft: latestDraft.current, source: "autosave" }),
        });
        setLastSavedAt(new Date());
      } catch {
        // Autosave failures are silent — the doctor can manual-save
      }
    }, 2000);
  }, [sessionId, isDirty]);

  // ── Draft mutation helper ────────────────────────────────────────────────
  const mutateDraft = useCallback((updater) => {
    setDraft((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
    setIsDirty(true);
    scheduleAutosave();
  }, [scheduleAutosave]);

  // ── Section handlers ─────────────────────────────────────────────────────
  const updateDiagnosis         = (arr) => mutateDraft((d) => ({ ...d, diagnosis: arr }));
  const updateInvestigations    = (arr) => mutateDraft((d) => ({ ...d, investigations: arr }));
  const updateAdvice            = (arr) => mutateDraft((d) => ({ ...d, advice: arr }));
  const updateFollowUp          = (val) => mutateDraft((d) => ({ ...d, followUpInstructions: val }));
  const updateWarnings          = (arr) => mutateDraft((d) => ({ ...d, warnings: arr }));

  const updateMedication = useCallback((index, updatedMed) => {
    mutateDraft((d) => {
      const meds = [...(d?.medications ?? [])];
      meds[index] = updatedMed;
      return { ...d, medications: meds };
    });
  }, [mutateDraft]);

  const removeMedication = useCallback((index) => {
    mutateDraft((d) => ({
      ...d,
      medications: (d?.medications ?? []).filter((_, i) => i !== index),
    }));
  }, [mutateDraft]);

  const addMedication = useCallback(() => {
    mutateDraft((d) => ({
      ...d,
      medications: [
        ...(d?.medications ?? []),
        {
          name: "", dosage: "", frequency: "", duration: "",
          instructions: "", confidence: 1.0,
        },
      ],
    }));
  }, [mutateDraft]);

  // ── Manual save ──────────────────────────────────────────────────────────
  const manualSave = useCallback(async () => {
    if (!draft) return;
    setIsSaving(true);
    setActionError(null);
    try {
      // Flush current draft first
      await fetch(`/api/scribe/sessions/${sessionId}/prescription/review`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ draft, source: "manual_edit" }),
      });
      // Create version snapshot
      const res     = await fetch(`/api/scribe/sessions/${sessionId}/prescription/review/save`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ source: "manual_save" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Save failed");

      // Reload versions
      const wsRes  = await fetch(`/api/scribe/sessions/${sessionId}/prescription/review`);
      const wsData = await wsRes.json().catch(() => ({}));
      if (wsRes.ok) setWorkspace(wsData);

      setIsDirty(false);
      setLastSavedAt(new Date());
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsSaving(false);
    }
  }, [sessionId, draft]);

  // ── Revert to version ────────────────────────────────────────────────────
  const revertToVersion = useCallback(async (version) => {
    if (!window.confirm(`Revert to version ${version.version_number}? Unsaved changes will be overwritten.`)) return;
    mutateDraft(version.draft);
    setActionError(null);
  }, [mutateDraft]);

  // ── Approve ──────────────────────────────────────────────────────────────
  const approve = useCallback(async () => {
    if (!window.confirm("Approve this prescription? This action will finalize the draft.")) return;
    setIsApproving(true);
    setActionError(null);
    try {
      // Flush any unsaved changes first
      if (isDirty && draft) {
        await fetch(`/api/scribe/sessions/${sessionId}/prescription/review`, {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ draft, source: "manual_edit" }),
        });
      }
      const res     = await fetch(`/api/scribe/sessions/${sessionId}/prescription/review/approve`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ create_version: true }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Approval failed");
      setIsDirty(false);
      if (onApproved) onApproved(payload);
      else await loadWorkspace();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsApproving(false);
    }
  }, [sessionId, draft, isDirty, loadWorkspace, onApproved]);

  // ── Reject ───────────────────────────────────────────────────────────────
  const handleRejectConfirm = useCallback(async (reason, regenerate) => {
    setIsRejecting(true);
    setActionError(null);
    try {
      const res     = await fetch(`/api/scribe/sessions/${sessionId}/prescription/review/reject`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ reason, regenerate }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || "Rejection failed");
      setShowRejectModal(false);
      if (regenerate) {
        // Draft is invalidated — parent should reload or navigate away
        if (onApproved) onApproved({ rejected: true, regenerate: true, ...payload });
      } else {
        await loadWorkspace();
      }
    } catch (err) {
      setActionError(err.message);
    } finally {
      setIsRejecting(false);
    }
  }, [sessionId, loadWorkspace, onApproved]);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  const sessionStatus = workspace?.session?.status;
  const isApproved    = sessionStatus === "PRESCRIPTION_APPROVED";
  const isReadonly    = isApproved;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Loading prescription review…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
        <p className="text-sm font-medium text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={loadWorkspace} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (!draft) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No prescription draft available for review.
      </p>
    );
  }

  const totalSafetyFlags = (draft.medications ?? []).reduce(
    (sum, med) => sum + getMedSafetyFlags(med).size, 0,
  );

  return (
    <div className="space-y-4" data-testid="prescription-review-workspace">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <StatusBadge status={sessionStatus} />
          {isDirty && (
            <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
              <Clock className="h-3 w-3" />
              Unsaved changes
            </span>
          )}
          {lastSavedAt && !isDirty && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              Saved {lastSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Version history toggle */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowVersions((v) => !v)}
            className="gap-1.5 text-xs"
          >
            <History className="h-3.5 w-3.5" />
            Versions{workspace?.versions?.length ? ` (${workspace.versions.length})` : ""}
          </Button>

          {!isReadonly && (
            <>
              {/* Manual save */}
              <Button
                variant="outline"
                size="sm"
                onClick={manualSave}
                disabled={isSaving || isApproving}
                className="gap-1.5 text-xs"
              >
                {isSaving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />
                }
                Save
              </Button>

              {/* Reject */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRejectModal(true)}
                disabled={isApproving || isRejecting}
                className="gap-1.5 text-xs text-destructive border-destructive/40 hover:bg-destructive/5"
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </Button>

              {/* Approve */}
              <Button
                size="sm"
                data-testid="prescription-approve"
                onClick={approve}
                disabled={isApproving || isRejecting || isSaving}
                className="gap-1.5 text-xs"
              >
                {isApproving
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />
                }
                Approve
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Action error ─────────────────────────────────────── */}
      {actionError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">{actionError}</p>
          <button
            onClick={() => setActionError(null)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Approved banner ─────────────────────────────────── */}
      {isApproved && (
        <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm font-medium text-green-800">
            Prescription approved
            {workspace?.draft?.approved_at &&
              ` · ${new Date(workspace.draft.approved_at).toLocaleString()}`}
          </p>
        </div>
      )}

      {/* ── Safety warnings banner ───────────────────────────── */}
      {(draft.warnings?.length > 0 || totalSafetyFlags > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              Safety Warnings
              {totalSafetyFlags > 0 && ` · ${totalSafetyFlags} medication flag${totalSafetyFlags > 1 ? "s" : ""}`}
            </p>
          </div>
          {draft.warnings?.length > 0 && (
            <ul className="space-y-1 pl-6">
              {draft.warnings.map((w, i) => (
                <li key={i} className="text-sm text-amber-700 list-disc">{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Version history ──────────────────────────────────── */}
      {showVersions && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4" />
              Version History
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <VersionHistoryPanel
              versions={workspace?.versions}
              onRevert={revertToVersion}
              readonly={isReadonly}
            />
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Diagnosis ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Diagnosis</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <EditableStringArray
              label="Diagnosis"
              items={draft.diagnosis}
              onChange={updateDiagnosis}
              readonly={isReadonly}
              placeholder="Diagnosis"
            />
          </CardContent>
        </Card>

        {/* ── Investigations ──────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Investigations</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <EditableStringArray
              label="Investigation"
              items={draft.investigations}
              onChange={updateInvestigations}
              readonly={isReadonly}
              placeholder="Investigation"
            />
          </CardContent>
        </Card>

        {/* ── Advice ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Advice</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <EditableStringArray
              label="Advice"
              items={draft.advice}
              onChange={updateAdvice}
              readonly={isReadonly}
              placeholder="Advice point"
            />
          </CardContent>
        </Card>

        {/* ── Follow-up ───────────────────────────────────────── */}
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm">Follow-up Instructions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Textarea
              value={draft.followUpInstructions ?? ""}
              onChange={(e) => updateFollowUp(e.target.value)}
              placeholder="Follow-up instructions…"
              rows={3}
              disabled={isReadonly}
              className="text-sm resize-none"
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Medications ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            Medications
            {(draft.medications?.length ?? 0) > 0 && (
              <span className="text-xs font-normal text-muted-foreground">
                ({draft.medications.length})
              </span>
            )}
            {totalSafetyFlags > 0 && (
              <span className="flex items-center gap-1 text-amber-600 text-xs font-medium">
                <AlertTriangle className="h-3 w-3" />
                {totalSafetyFlags} flag{totalSafetyFlags > 1 ? "s" : ""}
              </span>
            )}
          </CardTitle>
          {!isReadonly && (
            <Button variant="outline" size="sm" onClick={addMedication} className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {(!draft.medications || draft.medications.length === 0) ? (
            <p className="text-sm text-muted-foreground">
              No medications. The AI found no prescriptions in the consultation.
            </p>
          ) : (
            draft.medications.map((med, i) => (
              <MedicationCard
                key={i}
                med={med}
                index={i}
                onChange={updateMedication}
                onRemove={removeMedication}
                readonly={isReadonly}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* ── Warnings (editable by doctor) ──────────────────────── */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Warnings
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <EditableStringArray
            label="Warning"
            items={draft.warnings}
            onChange={updateWarnings}
            readonly={isReadonly}
            placeholder="Clinical warning or note"
          />
        </CardContent>
      </Card>

      {/* ── Reject modal ────────────────────────────────────────── */}
      <RejectModal
        open={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        onConfirm={handleRejectConfirm}
        isLoading={isRejecting}
      />
    </div>
  );
}
