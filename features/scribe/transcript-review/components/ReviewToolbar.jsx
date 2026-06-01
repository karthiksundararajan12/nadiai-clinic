"use client";

import { CheckCircle2, RotateCcw, RotateCw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function ReviewToolbar({
  hasChanges,
  saving,
  autosaveStatus,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onComplete,
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 border-b bg-background/95 p-3 backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={hasChanges ? "warning" : "success"}>
          {hasChanges ? "Unsaved changes" : "All changes saved"}
        </Badge>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          Autosave: {autosaveStatus}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onUndo} disabled={!canUndo || saving}>
          <RotateCcw className="size-4" />
          Undo
        </Button>
        <Button variant="outline" size="sm" onClick={onRedo} disabled={!canRedo || saving}>
          <RotateCw className="size-4" />
          Redo
        </Button>
        <Button variant="secondary" size="sm" onClick={onSave} disabled={saving}>
          <Save className="size-4" />
          Save version
        </Button>
        <Button size="sm" onClick={onComplete} disabled={saving || hasChanges}>
          <CheckCircle2 className="size-4" />
          Complete review
        </Button>
      </div>
    </div>
  );
}
