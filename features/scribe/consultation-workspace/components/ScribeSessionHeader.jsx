"use client";

import { History, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ScribeSessionHeader({
  toolbarLeft,
  onEndSession,
  onOpenSessions,
  onDelete,
  deleting = false,
  saveStatus,
  pipelineLabel,
  hasUnsavedChanges,
}) {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex min-w-0 items-center gap-3">
        {toolbarLeft}
        {pipelineLabel && (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            {pipelineLabel}
          </span>
        )}
        {hasUnsavedChanges && !pipelineLabel && (
          <span className="text-xs text-amber-700">Unsaved changes</span>
        )}
        {saveStatus && !pipelineLabel && (
          <SaveIndicator status={saveStatus} />
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {onOpenSessions && (
          <Button variant="ghost" size="sm" onClick={onOpenSessions} className="h-8 gap-1.5 text-xs">
            <History className="h-3.5 w-3.5" />
            Sessions
          </Button>
        )}

        {onDelete && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={deleting}
            data-testid="delete-session"
            className="h-8 gap-1.5 border-rose-200 text-xs text-rose-600 hover:bg-rose-50"
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete
          </Button>
        )}

        {onEndSession && (
          <Button variant="outline" size="sm" onClick={onEndSession} className="h-8 gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New
          </Button>
        )}
      </div>
    </header>
  );
}

function SaveIndicator({ status }) {
  const label =
    status === "saving" ? "Saving…" :
    status === "saved" ? "Saved" :
    status === "error" ? "Save failed" : null;
  if (!label) return null;

  return (
    <span
      className={cn(
        "text-xs",
        status === "error" ? "text-rose-600" : "text-slate-500",
      )}
    >
      {label}
    </span>
  );
}
