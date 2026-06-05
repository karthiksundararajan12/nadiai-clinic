"use client";

import {
  FilePlus2,
  Loader2,
  Mic,
  Pause,
  Play,
  Square,
  Stethoscope,
  UserRound,
} from "lucide-react";
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
  language,
  recordingControls,
  onStartRecording,
  isRequestingMic,
}) {
  const disabled = readOnly || saving || sessionStatus === "REVIEW_COMPLETED";
  const isLive = (mode === "recording" || isRecording) && !pipelineMessage;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="transcript-review-workspace">
      <PanelHeader isLive={isLive} />

      {isLive && isRecording && (
        <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-indigo-50/40 to-white px-6 py-5">
          <WaveformDisplay active={!isPaused} />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loadError && !pipelineMessage ? (
          <InlineErrorState error={loadError} onRetry={onRetryLoad} />
        ) : segments.length === 0 ? (
          <EmptyState
            isLive={isLive}
            isRequestingMic={isRequestingMic}
            pipelineMessage={pipelineMessage}
            onStartRecording={onStartRecording}
          />
        ) : (
          <div className="space-y-5 px-5 py-5">
            {segments.map((segment) => (
              <ChatBubble
                key={segment.id}
                segment={segment}
                dirty={Boolean(dirty[segment.id])}
                disabled={disabled}
                onChange={onChange}
              />
            ))}
          </div>
        )}
      </div>

      {isLive && recordingControls && (
        <RecordingControls
          isPaused={isPaused}
          duration={duration}
          language={language}
          controls={recordingControls}
        />
      )}
    </div>
  );
}

function PanelHeader({ isLive }) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">Live Consultation</h2>
        <p className="mt-0.5 text-[12px] text-slate-500">
          {isLive ? "Recording in progress" : "Transcribed conversation"}
        </p>
      </div>
      {isLive && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-600/15">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Live
        </span>
      )}
    </div>
  );
}

function InlineErrorState({ error, onRetry }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <p className="text-[13px] text-rose-600">{error?.message || "Failed to load transcript."}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

function EmptyState({ isLive, isRequestingMic, pipelineMessage, onStartRecording }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      {isRequestingMic ? (
        <>
          <Loader2 className="mb-4 h-9 w-9 animate-spin text-indigo-500" />
          <p className="text-[14px] font-medium text-slate-900">Allow microphone access</p>
          <p className="mt-1 max-w-xs text-[13px] text-slate-500">Required to capture the consultation.</p>
        </>
      ) : pipelineMessage ? (
        <>
          <Loader2 className="mb-4 h-9 w-9 animate-spin text-indigo-500" />
          <p className="text-[14px] font-medium text-slate-900">{pipelineMessage}</p>
        </>
      ) : onStartRecording ? (
        <>
          <button
            type="button"
            onClick={onStartRecording}
            className="group mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/20 transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            <Mic className="h-8 w-8" />
          </button>
          <p className="text-[15px] font-semibold text-slate-900">Start consultation</p>
          <p className="mt-1.5 max-w-[280px] text-[13px] leading-relaxed text-slate-500">
            Speak naturally with your patient. Transcript and clinical note generate when you stop.
          </p>
        </>
      ) : isLive ? (
        <>
          <div className="mb-4 h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-[14px] font-medium text-slate-900">Listening…</p>
        </>
      ) : (
        <p className="text-[13px] text-slate-500">No transcript segments yet.</p>
      )}
    </div>
  );
}

function RecordingControls({ isPaused, duration, language, controls }) {
  return (
    <div className="shrink-0 border-t border-slate-100 bg-slate-50/60 px-5 py-5">
      <div className="flex items-center justify-center gap-5">
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full border-slate-200 bg-white shadow-sm"
          onClick={controls.onPauseResume}
          disabled={controls.disabled}
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          className="h-[60px] w-[60px] rounded-full bg-slate-900 shadow-lg shadow-slate-900/25 hover:bg-slate-800"
          onClick={controls.onStop}
          disabled={controls.disabled}
        >
          <Square className="h-5 w-5 fill-current" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-12 w-12 rounded-full border-slate-200 bg-white shadow-sm"
          disabled
          title="Add note (coming soon)"
        >
          <FilePlus2 className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4 flex items-center justify-between text-[11px] font-medium text-slate-400">
        <span>{language ?? "English (India)"}</span>
        <span>Auto-save on</span>
        {duration != null && (
          <span className="font-mono tabular-nums text-slate-600">{formatTimestamp(duration)}</span>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ segment, dirty, disabled, onChange }) {
  const isDoctor =
    segment.speaker === "doctor" ||
    segment.speaker_label?.toLowerCase().includes("doctor");

  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-2 ring-white",
          isDoctor
            ? "bg-indigo-100 text-indigo-600"
            : "bg-teal-100 text-teal-600",
        )}
      >
        {isDoctor ? <Stethoscope className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-900">
            {segment.speaker_label ?? (isDoctor ? "Doctor" : "Patient")}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-slate-400">
            {formatTimestamp(segment.start_seconds)}
          </span>
          {segment.is_low_confidence && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              Low confidence
            </span>
          )}
          {dirty && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600">
              Edited
            </span>
          )}
        </div>
        <div
          className={cn(
            "rounded-2xl rounded-tl-md px-4 py-3 text-[14px] leading-relaxed",
            isDoctor
              ? "bg-slate-50 text-slate-800 ring-1 ring-slate-200/60"
              : "bg-white text-slate-800 ring-1 ring-slate-200/80 shadow-sm",
            dirty && "ring-2 ring-indigo-300/50",
          )}
        >
          {disabled ? (
            <p className="whitespace-pre-wrap">{segment.text}</p>
          ) : (
            <Textarea
              value={segment.text ?? ""}
              onChange={(e) => onChange(segment.id, { text: e.target.value })}
              rows={Math.min(6, Math.max(2, Math.ceil((segment.text?.length ?? 0) / 72)))}
              className="min-h-0 resize-none border-0 bg-transparent p-0 text-[14px] leading-relaxed shadow-none focus-visible:ring-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WaveformDisplay({ active }) {
  const bars = 32;
  return (
    <div className="flex h-[56px] items-end justify-center gap-[3px]">
      {Array.from({ length: bars }, (_, i) => {
        const center = (bars - 1) / 2;
        const envelope = 0.35 + 0.65 * (1 - Math.abs(i - center) / center);
        const h = active ? 12 + envelope * 44 : 6;
        return (
          <div
            key={i}
            className={cn(
              "w-[3px] rounded-full transition-all duration-150",
              active ? "bg-indigo-400" : "bg-slate-200",
            )}
            style={{
              height: `${h}px`,
              opacity: active ? 0.5 + envelope * 0.5 : 0.4,
              animation: active ? `pulse 1.2s ease-in-out ${i * 35}ms infinite` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
