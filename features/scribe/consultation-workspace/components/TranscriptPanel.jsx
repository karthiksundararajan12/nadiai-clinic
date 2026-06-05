"use client";

import { Loader2, Mic, Pause, Play, Square, Stethoscope, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../transcript-review/components/Timestamp.jsx";
import { EmptyTranscriptState } from "../../transcript-review/components/ReviewStateViews.jsx";

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
  language,
  onLanguageChange,
  recordingControls,
  onStartRecording,
  isRequestingMic,
}) {
  const disabled = readOnly || saving || sessionStatus === "REVIEW_COMPLETED";
  const isLive = mode === "recording" || isRecording;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-background"
      data-testid="transcript-review-workspace"
    >
      <div className="shrink-0 flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold">Live Consultation</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isLive ? "Recording in progress" : "Doctor–patient conversation"}
          </p>
        </div>
        {isLive && (
          <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 text-[10px]">
            <span className="mr-1 h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Recording
          </Badge>
        )}
      </div>

      {isLive && isRecording && (
        <div className="shrink-0 border-b bg-primary/5 px-4 py-4">
          <WaveformDisplay active={!isPaused} />
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        {segments.length === 0 ? (
          <div className="p-6">
            {isLive ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                {isRequestingMic ? (
                  <>
                    <Loader2 className="h-8 w-8 mb-3 animate-spin text-primary" />
                    <p className="text-sm font-medium text-foreground">Allow microphone access…</p>
                  </>
                ) : pipelineMessage ? (
                  <>
                    <Loader2 className="h-8 w-8 mb-3 animate-spin text-primary" />
                    <p className="text-sm font-medium text-foreground">{pipelineMessage}</p>
                  </>
                ) : onStartRecording ? (
                  <>
                    <button
                      type="button"
                      onClick={onStartRecording}
                      className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-transform hover:scale-105"
                    >
                      <Mic className="h-9 w-9" />
                    </button>
                    <p className="text-sm font-medium text-foreground">Tap to start consultation</p>
                    <p className="text-xs mt-1 max-w-xs">
                      Speak naturally — transcript and SOAP note generate when you stop.
                    </p>
                  </>
                ) : (
                  <>
                    <Mic className="h-8 w-8 mb-3 text-primary/40" />
                    <p className="text-sm font-medium text-foreground">Listening…</p>
                    <p className="text-xs mt-1 max-w-xs">
                      Transcript will appear here after you stop recording.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <EmptyTranscriptState />
            )}
          </div>
        ) : (
          <div className="space-y-4 p-4">
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
      </ScrollArea>

      {isLive && recordingControls && (
        <div className="shrink-0 border-t bg-muted/20 px-4 py-4">
          <div className="flex items-center justify-center gap-4">
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
              className="h-14 w-14 rounded-full bg-primary hover:bg-primary/90"
              onClick={recordingControls.onStop}
              disabled={recordingControls.disabled}
            >
              <Square className="h-5 w-5 fill-current" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full"
              disabled
              title="Add note (coming soon)"
            >
              <span className="text-lg leading-none">+</span>
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>{language ?? "English"}</span>
            <span>Auto save: On</span>
            {duration != null && (
              <span className="font-mono tabular-nums">{formatTimestamp(duration)}</span>
            )}
          </div>
        </div>
      )}
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
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isDoctor ? "bg-blue-100 text-blue-600" : "bg-emerald-100 text-emerald-600",
        )}
      >
        {isDoctor ? <Stethoscope className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-semibold">{segment.speaker_label ?? (isDoctor ? "Doctor" : "Patient")}</span>
          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
            {formatTimestamp(segment.start_seconds)}
          </span>
          {segment.is_low_confidence && (
            <Badge variant="warning" className="h-4 text-[9px] px-1">Low conf.</Badge>
          )}
          {dirty && <Badge variant="accent" className="h-4 text-[9px] px-1">Edited</Badge>}
        </div>
        <div
          className={cn(
            "rounded-xl rounded-tl-sm px-3 py-2.5 text-sm leading-relaxed",
            isDoctor ? "bg-blue-50/80 dark:bg-blue-950/20" : "bg-emerald-50/80 dark:bg-emerald-950/20",
            dirty && "ring-1 ring-primary/30",
          )}
        >
          {disabled ? (
            <p>{segment.text}</p>
          ) : (
            <Textarea
              value={segment.text ?? ""}
              onChange={(e) => onChange(segment.id, { text: e.target.value })}
              rows={Math.min(5, Math.max(2, Math.ceil((segment.text?.length ?? 0) / 70)))}
              className="min-h-0 resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WaveformDisplay({ active }) {
  const bars = 24;
  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {Array.from({ length: bars }, (_, i) => {
        const center = (bars - 1) / 2;
        const envelope = 1 - Math.abs(i - center) / center;
        return (
          <div
            key={i}
            className={cn(
              "w-1 rounded-full bg-primary/80 transition-all",
              active ? "animate-pulse" : "opacity-30",
            )}
            style={{
              height: active ? `${20 + envelope * 40}px` : "8px",
              animationDelay: active ? `${i * 40}ms` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
