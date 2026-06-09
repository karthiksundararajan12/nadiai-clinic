"use client";

import { History, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatConsultationStatus, formatVisitType } from "../../lib/consultation-labels.js";

function initials(name) {
  return (name ?? "P").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export function PatientContextHeader({
  patient,
  sessionDate,
  status,
  toolbarLeft,
  onOpenSessions,
  onEndSession,
  onDelete,
  deleting,
  saveStatus,
  hasUnsavedChanges,
  pipelineLabel,
  className,
}) {
  const name = patient?.name ?? "Walk-in Patient";
  const ageGender = [
    patient?.age ? `${patient.age} Years` : null,
    patient?.gender ?? null,
  ].filter(Boolean).join(" • ");

  const visitType = formatVisitType(patient);
  const dateLabel = sessionDate
    ? new Date(sessionDate).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const statusLabel = formatConsultationStatus(status);
  const isActionRequired = ["SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING"].includes(status);

  return (
    <header
      className={cn(
        "sticky top-0 z-20 border-b border-slate-200/80 bg-white/95 backdrop-blur-md shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 px-5 py-4 lg:px-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-100 text-sm font-semibold text-teal-800 ring-1 ring-teal-200/60">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">{name}</h1>
            {ageGender && (
              <p className="text-sm text-slate-600">{ageGender}</p>
            )}
            <p className="text-sm font-medium text-teal-700">{visitType}</p>
            <p className="mt-0.5 text-xs text-slate-500">{dateLabel}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn(
                  "text-xs font-medium",
                  isActionRequired && "border-amber-300 bg-amber-50 text-amber-800",
                  status === "COMPLETED" && "border-emerald-300 bg-emerald-50 text-emerald-800",
                )}
              >
                Status: {statusLabel}
              </Badge>
              {pipelineLabel && (
                <span className="text-xs text-slate-500">{pipelineLabel}</span>
              )}
              {hasUnsavedChanges && !pipelineLabel && (
                <span className="text-xs text-amber-700">Unsaved changes</span>
              )}
              {saveStatus === "saved" && !hasUnsavedChanges && (
                <span className="text-xs text-emerald-600">All changes saved</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {toolbarLeft}
          {onOpenSessions && (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={onOpenSessions}>
              <History className="h-3.5 w-3.5" />
              Sessions
            </Button>
          )}
          {onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-rose-200 text-xs text-rose-600"
              onClick={onDelete}
              disabled={deleting}
              data-testid="delete-session"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          )}
          {onEndSession && (
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={onEndSession}>
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
