"use client";

import { Loader2, Mic, Pause, Play, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../transcript-review/components/Timestamp.jsx";

export function TranscriptPanel({
  segments,
  dirty,
  readOnly,
  saving,
  sessionStatus,
  onChange,
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
}) {
  const disabled = readOnly || saving || sessionStatus === "REVIEW_COMPLETED";
  const isLive = (mode === "recording" || isRecording) && !pipelineMessage;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="transcript-review-workspace">
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
            {segments.map((segment) => (
              <div key={segment.id} className="py-3">
                <p className="mb-1 text-xs font-medium text-slate-500">
                  {segment.speaker_label ?? segment.speaker ?? "Speaker"}
                  <span className="ml-2 font-mono text-slate-400">
                    {formatTimestamp(segment.start_seconds)}
                  </span>
                </p>
                {disabled ? (
                  <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">{segment.text}</p>
                ) : (
                  <Textarea
                    value={segment.text ?? ""}
                    onChange={(e) => onChange(segment.id, { text: e.target.value })}
                    rows={Math.min(5, Math.max(2, Math.ceil((segment.text?.length ?? 0) / 80)))}
                    className={cn(
                      "min-h-0 resize-none border-slate-200 text-sm",
                      dirty[segment.id] && "border-indigo-300",
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
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
