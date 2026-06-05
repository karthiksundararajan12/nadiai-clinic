"use client";

import { Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SessionsDrawer({
  open,
  onClose,
  activeSessions,
  historySessions,
  loading,
  refreshing,
  error,
  busySessionId,
  lastRecordedSessionId,
  onRefresh,
  onOpen,
  onTranscribe,
  onDelete,
  canDelete,
}) {
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"
        role="dialog"
        aria-label="Past consultations"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900">Sessions</h2>
            <p className="text-[12px] text-slate-500">Active and archived consultations</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="consultations-refresh"
              onClick={onRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6">
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error.message}</p>
          )}

          {loading ? (
            <p className="text-[13px] text-slate-500 py-8 text-center">Loading sessions…</p>
          ) : (
            <>
              <SessionGroup
                title="Active"
                sessions={activeSessions}
                empty="No active consultations"
                busySessionId={busySessionId}
                lastRecordedSessionId={lastRecordedSessionId}
                onOpen={onOpen}
                onTranscribe={onTranscribe}
                onDelete={onDelete}
                canDelete={canDelete}
              />
              <SessionGroup
                title="History"
                sessions={historySessions}
                empty="No archived consultations"
                busySessionId={busySessionId}
                onOpen={onOpen}
                readOnly
              />
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function SessionGroup({
  title,
  sessions,
  empty,
  busySessionId,
  lastRecordedSessionId,
  onOpen,
  onTranscribe,
  onDelete,
  canDelete,
  readOnly,
}) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      {sessions.length === 0 ? (
        <p className="text-[13px] text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              busy={busySessionId === session.id}
              isLatest={session.id === lastRecordedSessionId}
              readOnly={readOnly}
              onOpen={() => onOpen(session.id, Boolean(readOnly))}
              onTranscribe={onTranscribe ? () => onTranscribe(session.id) : undefined}
              onDelete={onDelete && canDelete?.(session.status) ? () => onDelete(session.id) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionRow({ session, busy, isLatest, onOpen, onTranscribe, onDelete, readOnly }) {
  const status = session.status?.replace(/_/g, " ") ?? "—";
  const date = new Date(session.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const needsTranscribe = ["UPLOADED", "TRANSCRIPTION_FAILED"].includes(session.status);
  const canRetry = ["TRANSCRIPTION_QUEUED", "TRANSCRIBING"].includes(session.status);
  const canOpen =
    readOnly ||
    ["TRANSCRIBED", "REVIEWING", "REVIEW_COMPLETED"].includes(session.status) ||
    ["SOAP_READY", "SOAP_REVIEW_REQUIRED", "SOAP_REVIEWING", "GENERATING_SOAP"].includes(session.status);

  return (
    <li
      className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3"
      data-testid="consultation-row"
      data-session-id={session.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-slate-400">{session.id.slice(0, 8)}…</span>
            {isLatest && <Badge className="h-5 text-[10px]">Latest</Badge>}
          </div>
          <p className="mt-0.5 text-[12px] text-slate-500">{date}</p>
          <p className="mt-1 text-[12px] font-medium capitalize text-slate-700">{status}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          {(needsTranscribe || canRetry) && onTranscribe && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busy} onClick={onTranscribe}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : canRetry ? "Retry" : "Transcribe"}
            </Button>
          )}
          {canOpen && (
            <Button
              size="sm"
              className="h-7 text-[11px] bg-slate-900 hover:bg-slate-800"
              data-testid="review-transcript"
              onClick={onOpen}
            >
              Open
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-rose-500"
              data-testid="delete-session"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
