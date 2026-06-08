"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Mic,
  Pause,
  Play,
  Save,
  Search,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../transcript-review/components/Timestamp.jsx";
import { SpeakerSelect } from "../../transcript-review/components/SpeakerSelect.jsx";
import { AudioPlaybackBar } from "./AudioPlaybackBar.jsx";
import { inferSoapSectionFromSegment } from "../lib/transcript-soap-link.js";

export function TranscriptPanel({
  sessionId,
  segments,
  dirty,
  readOnly,
  saving,
  sessionStatus,
  onChange,
  onSave,
  hasChanges,
  autosaveStatus,
  mode = "review",
  isRecording,
  isPaused,
  duration,
  pipelineMessage,
  loadError,
  onRetryLoad,
  poorTranscription,
  onDelete,
  deleting,
  recordingControls,
  onStartRecording,
  isRequestingMic,
  activeSegmentId,
  onSegmentClick,
  onAudioTimeUpdate,
  onSeekReady,
  highlightedSoapSection,
}) {
  const [query, setQuery] = useState("");
  const disabled = readOnly || saving || sessionStatus === "REVIEW_COMPLETED";
  const isLive = (mode === "recording" || isRecording) && !pipelineMessage;

  const filteredSegments = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return segments;
    return segments.filter(
      (s) =>
        (s.text ?? "").toLowerCase().includes(q) ||
        (s.speaker_label ?? "").toLowerCase().includes(q),
    );
  }, [segments, query]);

  const lowConfidenceCount = useMemo(
    () => segments.filter((s) => s.is_low_confidence).length,
    [segments],
  );

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="transcript-review-workspace">
      {sessionId && mode === "review" && segments.length > 0 && (
        <AudioPlaybackBar
          sessionId={sessionId}
          onTimeUpdate={onAudioTimeUpdate}
          onSeekReady={onSeekReady}
        />
      )}

      {segments.length > 0 && mode === "review" && (
        <div className="shrink-0 space-y-2 border-b border-slate-100 px-4 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search transcript…"
              className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-indigo-400"
              aria-label="Search transcript"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              {segments.length} segments
              {lowConfidenceCount > 0 && (
                <span className="ml-2 text-amber-700">
                  · {lowConfidenceCount} low confidence
                </span>
              )}
            </span>
            {!readOnly && onSave && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={onSave}
                disabled={saving || !hasChanges}
              >
                <Save className="h-3 w-3" />
                Save
              </Button>
            )}
          </div>
          {autosaveStatus === "saved" && !hasChanges && (
            <p className="text-xs text-emerald-600">Transcript saved</p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError && !pipelineMessage ? (
          <CenterMessage
            error={loadError?.message || "Failed to load transcript."}
            onRetry={onRetryLoad}
            onDelete={onDelete}
            deleting={deleting}
          />
        ) : segments.length === 0 ? (
          <EmptyRecording
            isLive={isLive}
            isRecording={isRecording}
            isPaused={isPaused}
            duration={duration}
            isRequestingMic={isRequestingMic}
            pipelineMessage={pipelineMessage}
            onStartRecording={onStartRecording}
            recordingControls={recordingControls}
            poorTranscription={poorTranscription}
            onDelete={onDelete}
            deleting={deleting}
          />
        ) : (
          <div className="divide-y divide-slate-100 px-4">
            {poorTranscription && (
              <div className="py-3">
                <p className="mb-2 text-xs text-amber-700">Transcription unclear. Delete and record again.</p>
                <DeleteButton onDelete={onDelete} deleting={deleting} />
              </div>
            )}
            {filteredSegments.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">No matches for &ldquo;{query}&rdquo;</p>
            ) : (
              filteredSegments.map((segment) => (
                <TranscriptSegmentRow
                  key={segment.id}
                  segment={segment}
                  dirty={Boolean(dirty[segment.id])}
                  disabled={disabled}
                  active={activeSegmentId === segment.id}
                  linkedSection={inferSoapSectionFromSegment(segment)}
                  highlighted={highlightedSoapSection === inferSoapSectionFromSegment(segment)}
                  onChange={onChange}
                  onClick={() => onSegmentClick?.(segment)}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TranscriptSegmentRow({
  segment,
  dirty,
  disabled,
  active,
  linkedSection,
  highlighted,
  onChange,
  onClick,
}) {
  const lowConfidence = segment.is_low_confidence;

  return (
    <div
      className={cn(
        "py-3 transition-colors",
        lowConfidence && "bg-amber-50/60",
        active && "bg-indigo-50/50",
        highlighted && "ring-1 ring-inset ring-indigo-200",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {disabled ? (
          <span className="text-xs font-semibold text-slate-700">
            {segment.speaker_label ?? segment.speaker ?? "Speaker"}
          </span>
        ) : (
          <SpeakerSelect
            speaker={segment.speaker}
            speakerLabel={segment.speaker_label}
            disabled={disabled}
            onChange={(patch) => onChange(segment.id, patch)}
          />
        )}
        <button
          type="button"
          onClick={onClick}
          className="font-mono text-xs text-indigo-600 hover:underline"
          title={`Jump to ${formatTimestamp(segment.start_seconds)} · highlights ${linkedSection}`}
        >
          {formatTimestamp(segment.start_seconds)}
        </button>
        {lowConfidence && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
            <AlertTriangle className="h-3 w-3" />
            Low confidence
            {segment.confidence != null && ` ${Math.round(segment.confidence * 100)}%`}
          </span>
        )}
        {dirty && <span className="text-[10px] font-medium text-indigo-600">Unsaved</span>}
      </div>

      {disabled ? (
        <p className="cursor-pointer text-sm leading-relaxed text-slate-800 whitespace-pre-wrap" onClick={onClick}>
          {segment.text}
        </p>
      ) : (
        <Textarea
          value={segment.text ?? ""}
          onChange={(e) => onChange(segment.id, { text: e.target.value })}
          onFocus={onClick}
          rows={Math.min(5, Math.max(2, Math.ceil((segment.text?.length ?? 0) / 80)))}
          className={cn(
            "min-h-0 resize-none border-slate-200 text-sm",
            dirty && "border-indigo-300",
            lowConfidence && "border-amber-300",
          )}
        />
      )}
    </div>
  );
}

function DeleteButton({ onDelete, deleting, className }) {
  if (!onDelete) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onDelete}
      disabled={deleting}
      data-testid="delete-session"
      className={cn("gap-1.5 border-rose-200 text-rose-600 hover:bg-rose-50", className)}
    >
      {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      Delete recording
    </Button>
  );
}

function CenterMessage({ error, onRetry, onDelete, deleting }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
      <p className="text-sm text-rose-600">{error}</p>
      <div className="flex gap-2">
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        )}
        <DeleteButton onDelete={onDelete} deleting={deleting} />
      </div>
    </div>
  );
}

function EmptyRecording({
  isLive,
  isRecording,
  isPaused,
  duration,
  isRequestingMic,
  pipelineMessage,
  onStartRecording,
  recordingControls,
  poorTranscription,
  onDelete,
  deleting,
}) {
  if (isRequestingMic) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <p className="text-sm text-slate-600">Allow microphone access</p>
      </div>
    );
  }

  if (pipelineMessage) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-10">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        <p className="text-sm text-slate-600">{pipelineMessage}</p>
      </div>
    );
  }

  if (isRecording && recordingControls) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 px-6 py-10">
        <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900">
          {formatTimestamp(duration ?? 0)}
        </span>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-full"
            onClick={recordingControls.onPauseResume}
            disabled={recordingControls.disabled}
          >
            {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            className="h-14 w-14 rounded-full bg-slate-900 hover:bg-slate-800"
            onClick={recordingControls.onStop}
            disabled={recordingControls.disabled}
          >
            <Square className="h-5 w-5 fill-current" />
          </Button>
        </div>
      </div>
    );
  }

  if (onStartRecording) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-6 py-10">
        <button
          type="button"
          onClick={onStartRecording}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-white shadow-md hover:bg-slate-800"
        >
          <Mic className="h-7 w-7" />
        </button>
        <p className="text-sm text-slate-500">Tap to start recording</p>
      </div>
    );
  }

  if (poorTranscription) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-900">No usable transcript</p>
        <p className="max-w-xs text-sm text-slate-500">Recording was too short or unclear.</p>
        <DeleteButton onDelete={onDelete} deleting={deleting} />
      </div>
    );
  }

  if (isLive) {
    return (
      <div className="flex h-full items-center justify-center px-6 py-10">
        <p className="text-sm text-slate-500">Ready to record</p>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center px-6 py-10">
      <p className="text-sm text-slate-500">No transcript yet</p>
    </div>
  );
}
