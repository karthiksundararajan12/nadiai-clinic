"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Play,
  Search,
  Stethoscope,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../../transcript-review/components/Timestamp.jsx";

function isDoctor(segment) {
  const label = segment.speaker_label ?? segment.speaker ?? "";
  return label === "Doctor" || label === "A";
}

export function ChatTranscriptPanel({
  sessionId,
  segments = [],
  dirty = {},
  readOnly,
  saving,
  activeSegmentId,
  pipelineMessage,
  loadError,
  onChange,
  onRetryLoad,
  onSegmentClick,
  onPlayFromHere,
  onDelete,
  deleting,
  poorTranscription,
  audioPlayer,
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState(null);
  const bottomRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter(
      (s) =>
        (s.text ?? "").toLowerCase().includes(q) ||
        (s.speaker_label ?? "").toLowerCase().includes(q),
    );
  }, [segments, query]);

  useEffect(() => {
    if (segments.length && !query) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments.length, query]);

  if (loadError && !pipelineMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center" data-testid="transcript-review-workspace">
        <p className="text-sm text-rose-600">{loadError.message}</p>
        {onRetryLoad && <Button variant="outline" size="sm" onClick={onRetryLoad}>Retry</Button>}
      </div>
    );
  }

  if (pipelineMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8" data-testid="transcript-review-workspace">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-slate-600">{pipelineMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="transcript-review-workspace">
      {sessionId && audioPlayer}

      <div className="shrink-0 border-b border-slate-100 px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversation…"
            className="h-9 w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {poorTranscription && onDelete && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <p className="text-xs text-amber-800">Transcription quality is poor.</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={onDelete} disabled={deleting} data-testid="delete-session">
              Delete recording
            </Button>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No transcript segments yet.</p>
        ) : (
          <div className="space-y-4">
            {filtered.map((segment) => {
              const doctor = isDoctor(segment);
              const low = segment.is_low_confidence;
              const active = activeSegmentId === segment.id;
              const editing = editingId === segment.id;

              return (
                <div
                  key={segment.id}
                  id={`chat-segment-${segment.id}`}
                  className={cn(
                    "flex gap-2",
                    doctor ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      doctor ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {doctor ? <Stethoscope className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>

                  <div className={cn("max-w-[85%] min-w-0", doctor && "items-end text-right")}>
                    <div className={cn("mb-1 flex items-center gap-2", doctor && "justify-end")}>
                      <span className="text-xs font-semibold text-slate-700">
                        {segment.speaker_label ?? (doctor ? "Doctor" : "Patient")}
                      </span>
                      <button
                        type="button"
                        className="font-mono text-[10px] text-slate-400 hover:text-primary"
                        onClick={() => onSegmentClick?.(segment)}
                      >
                        {formatTimestamp(segment.start_seconds)}
                      </button>
                      {low && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Low confidence
                        </span>
                      )}
                    </div>

                    <div
                      className={cn(
                        "group relative rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm",
                        doctor
                          ? "rounded-tr-md bg-primary text-white"
                          : "rounded-tl-md border border-slate-200 bg-white text-slate-800",
                        low && !doctor && "border-amber-300 bg-amber-50/80",
                        active && "ring-2 ring-primary/30",
                        dirty[segment.id] && "ring-2 ring-indigo-300",
                      )}
                    >
                      {editing && !readOnly ? (
                        <Textarea
                          value={segment.text ?? ""}
                          onChange={(e) => onChange(segment.id, { text: e.target.value })}
                          rows={3}
                          className="min-h-0 resize-none border-0 bg-transparent p-0 text-inherit focus-visible:ring-0"
                          disabled={saving}
                        />
                      ) : (
                        <p className="whitespace-pre-wrap">{segment.text}</p>
                      )}

                      <div className={cn("mt-2 flex flex-wrap gap-1", doctor && "justify-end")}>
                        <Button
                          type="button"
                          variant={doctor ? "secondary" : "outline"}
                          size="sm"
                          className="h-7 gap-1 px-2 text-[11px]"
                          onClick={() => onPlayFromHere?.(segment)}
                        >
                          <Play className="h-3 w-3" />
                          Play From Here
                        </Button>
                        {!readOnly && !editing && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-[11px] opacity-0 group-hover:opacity-100"
                            onClick={() => setEditingId(segment.id)}
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </Button>
                        )}
                        {editing && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => setEditingId(null)}
                          >
                            Done
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  );
}
