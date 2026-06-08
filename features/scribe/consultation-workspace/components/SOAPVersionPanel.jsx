"use client";

import { History, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SOAPVersionPanel({ versions, readOnly, restoring, onRestore }) {
  const sorted = [...(versions ?? [])].sort(
    (a, b) => (b.version_number ?? 0) - (a.version_number ?? 0),
  );

  if (!sorted.length) return null;

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <History className="h-3.5 w-3.5" />
        Version history
      </p>
      <ul className="max-h-32 space-y-2 overflow-y-auto">
        {sorted.slice(0, 8).map((version) => (
          <li
            key={version.id}
            className={cn(
              "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs",
              version.is_approved_version && "border-emerald-200 bg-emerald-50/50",
            )}
          >
            <span className="min-w-0">
              <span className="font-medium text-slate-800">
                v{version.version_number}
                {version.is_approved_version ? " · Approved" : ""}
              </span>
              <span className="block text-slate-500">
                {new Date(version.created_at).toLocaleString()}
              </span>
            </span>
            {!readOnly && !version.is_approved_version && onRestore && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 gap-1 px-2"
                disabled={restoring}
                onClick={() => onRestore(version.id)}
              >
                <RotateCcw className="h-3 w-3" />
                Restore
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
