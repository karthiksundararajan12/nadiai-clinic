"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Download,
  History,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Save,
  Shield,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConsultationActionBar({
  readOnly,
  canApprove,
  canRegenerate,
  canExport,
  hasDirty,
  saving,
  regenerating,
  exporting,
  blockingApproval,
  onApprove,
  onSave,
  onRegenerate,
  onExport,
  onReject,
  onOpenVersions,
  onOpenAudit,
  className,
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (readOnly) {
    return canExport ? (
      <footer className={cn("sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur-md lg:px-6", className)}>
        <Button
          variant="outline"
          className="w-full gap-2 sm:w-auto"
          onClick={onExport}
          disabled={exporting}
          data-testid="soap-export-pdf"
        >
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export PDF
        </Button>
      </footer>
    ) : null;
  }

  return (
    <footer
      className={cn(
        "sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_24px_rgba(15,23,42,0.06)] backdrop-blur-md lg:px-6",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {canApprove && (
            <Button
              className="gap-2 bg-teal-600 px-5 hover:bg-teal-700"
              onClick={onApprove}
              disabled={saving || regenerating || hasDirty || blockingApproval}
              data-testid="soap-approve"
            >
              <CheckCircle2 className="h-4 w-4" />
              Approve SOAP
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={onSave}
            disabled={saving || !hasDirty}
          >
            <Save className="h-4 w-4" />
            Save Draft
          </Button>
          {canRegenerate && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={onRegenerate}
              disabled={saving || regenerating}
            >
              <RefreshCw className={cn("h-4 w-4", regenerating && "animate-spin")} />
              Regenerate
            </Button>
          )}
        </div>

        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-10"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute bottom-full right-0 z-20 mb-2 w-48 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                {canExport && (
                  <MenuItem
                    icon={Download}
                    label="Export PDF"
                    onClick={() => { setMenuOpen(false); onExport?.(); }}
                    testId="soap-export-pdf"
                  />
                )}
                <MenuItem icon={History} label="Version History" onClick={() => { setMenuOpen(false); onOpenVersions?.(); }} />
                <MenuItem icon={Shield} label="Audit Trail" onClick={() => { setMenuOpen(false); onOpenAudit?.(); }} />
                {canApprove && (
                  <MenuItem
                    icon={XCircle}
                    label="Reject SOAP"
                    destructive
                    onClick={() => {
                      setMenuOpen(false);
                      const reason = window.prompt("Reason for rejecting this SOAP note:");
                      if (reason?.trim()) onReject?.(reason.trim());
                    }}
                    testId="soap-reject"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}

function MenuItem({ icon: Icon, label, onClick, destructive, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50",
        destructive ? "text-rose-600" : "text-slate-700",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
