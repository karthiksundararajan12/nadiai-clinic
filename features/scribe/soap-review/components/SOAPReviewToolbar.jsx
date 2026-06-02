"use client";

import { CheckCircle2, RotateCcw, RotateCw, Save, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function SOAPReviewToolbar({
  status,
  hasChanges,
  saving,
  autosaveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onApprove,
  onReject,
}) {
  const approved = status === "SOAP_APPROVED" || status === "READY_FOR_PRESCRIPTION";

  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 p-3 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={approved ? "success" : hasChanges ? "warning" : "secondary"}>{status}</Badge>
        <Badge variant={hasChanges ? "warning" : "success"}>
          {hasChanges ? "Unsaved changes" : "All changes saved"}
        </Badge>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Autosave: {autosaveStatus} · Shortcuts: Cmd/Ctrl+S save, Cmd/Ctrl+Enter approve
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo || saving || approved}>
          <RotateCcw className="size-4" />
          Undo
        </Button>
        <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo || saving || approved}>
          <RotateCw className="size-4" />
          Redo
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onSave}
          disabled={saving || approved || !hasChanges}
        >
          <Save className="size-4" />
          Save version
        </Button>
        <Button variant="destructive" size="sm" onClick={onReject} disabled={saving || approved}>
          <XCircle className="size-4" />
          Reject
        </Button>
        <Button size="sm" onClick={onApprove} disabled={saving || hasChanges || approved}>
          <CheckCircle2 className="size-4" />
          Approve
        </Button>
      </div>
    </div>
  );
}
