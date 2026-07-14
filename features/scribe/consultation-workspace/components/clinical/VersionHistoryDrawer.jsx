"use client";

import { GitCompare, History, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveSoapVersionLabel } from "../../lib/soap-version-labels.js";

export function VersionHistoryDrawer({
  open,
  onClose,
  versions,
  readOnly,
  restoring,
  onRestore,
  onCompare,
}) {
  const sorted = [...(versions ?? [])].sort(
    (a, b) => (b.version_number ?? 0) - (a.version_number ?? 0),
  );

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-[1px]"
        aria-label="Close version history"
        onClick={onClose}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl",
        )}
        aria-label="SOAP version history"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Version History</h2>
              <p className="text-xs text-slate-500">{sorted.length} versions</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No versions saved yet.</p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((version) => (
                <li
                  key={version.id}
                  className={cn(
                    "rounded-2xl border p-4",
                    version.is_approved_version
                      ? "border-emerald-200 bg-emerald-50/40"
                      : "border-slate-200 bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {resolveSoapVersionLabel(version)}
                        {version.is_approved_version && (
                          <span className="ml-2 text-xs font-normal text-emerald-700">Approved</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(version.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!readOnly && !version.is_approved_version && onRestore && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        disabled={restoring}
                        onClick={() => onRestore(version.id)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        Restore
                      </Button>
                    )}
                    {onCompare && sorted.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={() => onCompare(version.id, sorted[0]?.id)}
                      >
                        <GitCompare className="h-3 w-3" />
                        Compare
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
