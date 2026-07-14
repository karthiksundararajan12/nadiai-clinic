"use client";

import { useState } from "react";
import {
  CheckCircle,
  Download,
  History,
  Loader2,
  Mic,
  MicOff,
  MoreHorizontal,
  Shield,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name) {
  return (name ?? "P").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

export function RecordingEngine({
  patient,
  recordState = "idle",
  onStartRecording,
  onStopRecording,
  canApprove,
  approving,
  onApprove,
  onExport,
  onOpenVersions,
  onOpenAudit,
  onReject,
  exporting,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const name = patient?.name ?? "No patient selected";

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 flex h-[72px] items-center justify-between border-t border-gray-200 bg-white px-6 md:left-[260px]">
      {/* LEFT — patient chip */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {initials(name)}
        </div>
        <div className="min-w-0 hidden sm:block">
          <p className="truncate text-sm font-medium text-gray-900">{name}</p>
          {patient?.age && <p className="text-xs text-gray-500">{patient.age} years</p>}
        </div>
      </div>

      {/* CENTER — record button */}
      <div className="flex flex-1 justify-center px-4">
        {recordState === "idle" && (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-2 rounded-full border border-gray-200 bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 transition-all duration-200 hover:border-gray-300 hover:bg-gray-50"
            onClick={onStartRecording}
          >
            <Mic className="h-5 w-5" />
            Start Recording
          </button>
        )}
        {recordState === "recording" && (
          <button
            type="button"
            className="relative flex cursor-pointer items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-200 transition-all duration-200 animate-pulse"
            onClick={onStopRecording}
          >
            <span className="absolute inset-0 rounded-full ring-2 ring-red-400 ring-offset-2 animate-ping opacity-75" />
            <MicOff className="relative h-5 w-5" />
            <span className="relative">Stop Recording</span>
          </button>
        )}
        {recordState === "processing" && (
          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-center gap-2 rounded-full bg-gray-100 px-6 py-2.5 text-sm font-semibold text-gray-400"
          >
            <Loader2 className="h-5 w-5 animate-spin" />
            Generating SOAP...
          </button>
        )}
      </div>

      {/* RIGHT — actions */}
      <div className="flex items-center gap-2">
        {canApprove && (
          <button
            type="button"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onApprove}
            disabled={approving}
            data-testid="soap-approve"
          >
            {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            <span className="hidden md:inline">Approve SOAP</span>
          </button>
        )}
        <div className="relative">
          <button
            type="button"
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-gray-200 transition-all duration-200 hover:bg-gray-50"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <>
              <button type="button" className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-label="Close" />
              <div className="absolute bottom-full right-0 z-20 mb-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                <MenuItem icon={Download} label="Export PDF" onClick={() => { setMenuOpen(false); onExport?.(); }} testId="soap-export-pdf" loading={exporting} />
                <MenuItem icon={History} label="Version History" onClick={() => { setMenuOpen(false); onOpenVersions?.(); }} />
                <MenuItem icon={Shield} label="Audit Trail" onClick={() => { setMenuOpen(false); onOpenAudit?.(); }} />
                {canApprove && (
                  <MenuItem icon={XCircle} label="Reject SOAP" destructive onClick={() => {
                    setMenuOpen(false);
                    const reason = window.prompt("Reason for rejecting this SOAP note:");
                    if (reason?.trim()) onReject?.(reason.trim());
                  }} testId="soap-reject" />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </footer>
  );
}

function MenuItem({ icon: Icon, label, onClick, destructive, testId, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm transition-all duration-200 hover:bg-gray-50",
        destructive ? "text-red-600" : "text-gray-700",
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}
