"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleNotch, Waveform } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../../transcript-review/components/Timestamp.jsx";

const WAVE_BARS = [10, 18, 28, 14, 36, 22, 12, 32, 20, 16, 30, 12, 24, 18, 10, 26];

function isDoctor(segment) {
  const label = segment.speaker_label ?? segment.speaker ?? "";
  return label === "Doctor" || label === "A";
}

function speakerLabel(segment) {
  return isDoctor(segment) ? "Doctor" : "Patient";
}

function WaveformBars({ animated = false, live = false }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-1 rounded-lg px-4",
        live ? "h-16 bg-[color:var(--scribe-indigo-50)]" : "h-12 bg-[color:var(--scribe-indigo-50)]",
      )}
      aria-hidden
    >
      {WAVE_BARS.map((height, index) => (
        <span
          key={index}
          className={cn(
            "w-1 rounded-full",
            live ? "origin-center bg-[color:var(--scribe-indigo-600)]" : "bg-[color:var(--scribe-indigo-600)]/35",
            animated && "origin-center animate-[scribe-wave_1.15s_ease-in-out_infinite]",
          )}
          style={{
            height: `${live ? height : Math.max(8, Math.round(height * 0.45))}px`,
            animationDelay: `${index * 70}ms`,
          }}
        />
      ))}
    </div>
  );
}

function ConversationHeading({ isLiveRecording, hasPatient }) {
  const title = isLiveRecording
    ? "Live Audio Waveform"
    : hasPatient
      ? "Conversation & Live Audio"
      : "Conversation & Audio Waveform";
  const standby = hasPatient ? "Standby (00:00)" : "Collapsed (Inactive)";

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="flex items-center gap-2.5 text-sm font-bold text-[color:var(--scribe-heading)]">
        <span className="scribe-icon-tile h-9 w-9 shrink-0">
          <Waveform size={22} weight="duotone" className="scribe-icon" aria-hidden />
        </span>
        {isLiveRecording && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" aria-hidden />
        )}
        {title}
      </p>
      {!isLiveRecording && (
        <p className="scribe-text-muted text-sm font-medium">{standby}</p>
      )}
    </div>
  );
}

export function ScribeConversationChat({
  segments = [],
  loading,
  loadingMessage,
  highlightedSegmentId = null,
  isLiveRecording = false,
  animateWaveform = false,
  hasPatient = false,
  clinicalById = {},
  onSelectionChange,
}) {
  const bottomRef = useRef(null);
  const segmentKey = segments.map((segment) => segment.id).join("|");
  const [selection, setSelection] = useState({
    key: segmentKey,
    inclusionOverrides: {},
    deletedIds: [],
  });
  const inclusionOverrides = useMemo(
    () => (selection.key === segmentKey ? selection.inclusionOverrides : {}),
    [selection.key, selection.inclusionOverrides, segmentKey],
  );
  const deletedIds = useMemo(
    () => (selection.key === segmentKey ? selection.deletedIds : []),
    [selection.key, selection.deletedIds, segmentKey],
  );

  const visibleSegments = useMemo(
    () => segments.filter((segment) => !deletedIds.includes(segment.id)),
    [segments, deletedIds],
  );

  useEffect(() => {
    onSelectionChange?.({
      deleted_segment_ids: deletedIds,
      segment_inclusion: inclusionOverrides,
    });
  }, [deletedIds, inclusionOverrides, onSelectionChange]);

  useEffect(() => {
    if (segments.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [segments]);

  function isIncluded(segment) {
    if (Object.prototype.hasOwnProperty.call(inclusionOverrides, segment.id)) {
      return inclusionOverrides[segment.id] === true;
    }
    return clinicalById[segment.id] !== false;
  }

  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 bg-[color:var(--scribe-card-bg)] px-4 py-4 text-left">
        <ConversationHeading isLiveRecording={false} hasPatient={hasPatient} />
        <WaveformBars />
        <div className="flex items-center justify-center gap-2 py-4 text-center">
          <CircleNotch size={20} weight="bold" className="animate-spin scribe-icon" />
          <p className="scribe-text-muted text-sm font-medium">{loadingMessage ?? "Processing conversation…"}</p>
        </div>
      </div>
    );
  }

  if (!segments.length) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 bg-[color:var(--scribe-card-bg)] px-4 py-4"
        data-testid="conversation-placeholder"
      >
        <ConversationHeading isLiveRecording={isLiveRecording} hasPatient={hasPatient} />
        <WaveformBars animated={animateWaveform} live={isLiveRecording} />
        {isLiveRecording ? (
          <p className="scribe-text-muted text-sm font-medium">
            Transcript will appear here once you stop recording.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[color:var(--scribe-card-bg)]" data-testid="transcript-review-workspace">
      <div className="shrink-0 border-b border-[color:var(--scribe-card-border)] px-4 py-3">
        <ConversationHeading isLiveRecording={false} hasPatient={hasPatient} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-3">
          {visibleSegments.map((segment) => {
            const doctor = isDoctor(segment);
            const label = speakerLabel(segment);
            const isHighlighted = highlightedSegmentId === segment.id;
            const isInterim = Boolean(segment.is_interim);
            const included = isIncluded(segment);
            return (
              <div
                key={segment.id}
                id={`chat-segment-${segment.id}`}
                className={cn(
                  "scribe-card rounded-lg px-3 py-2 transition-all duration-300",
                  isHighlighted && "animate-evidence-pulse ring-2 ring-[color:var(--scribe-indigo-100)] ring-offset-2",
                  !included && "opacity-50",
                )}
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "text-sm font-bold uppercase tracking-wide",
                      doctor ? "text-[color:var(--scribe-indigo-600)]" : "scribe-text-muted",
                    )}
                  >
                    {label}
                  </p>
                  <span className="scribe-text-muted font-mono text-sm tabular-nums font-medium">
                    {isInterim ? "draft" : formatTimestamp(segment.start_seconds ?? segment.start)}
                  </span>
                </div>
                <div
                  className={cn(
                    "text-sm font-medium leading-relaxed",
                    included ? "text-[color:var(--scribe-heading)]" : "scribe-text-muted",
                    isInterim && "italic scribe-text-muted",
                  )}
                  data-testid={isInterim ? "live-interim-transcript" : undefined}
                >
                  <p className={cn("whitespace-pre-wrap", isInterim && "italic scribe-text-muted")}>
                    {segment.text}
                  </p>
                </div>
                {!isInterim && (
                  <div className="mt-2 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      aria-pressed={included}
                      data-testid={`include-in-note-${segment.id}`}
                      className={cn(
                        "cursor-pointer text-sm font-semibold",
                        included ? "text-[color:var(--scribe-indigo-600)]" : "scribe-text-muted",
                      )}
                      onClick={() => {
                        setSelection({
                          key: segmentKey,
                          inclusionOverrides: { ...inclusionOverrides, [segment.id]: !included },
                          deletedIds,
                        });
                      }}
                    >
                      Include in note
                    </button>
                    <button
                      type="button"
                      data-testid={`delete-turn-${segment.id}`}
                      className="scribe-text-muted cursor-pointer text-sm font-semibold hover:text-[color:var(--scribe-heading)]"
                      onClick={() => {
                        setSelection({
                          key: segmentKey,
                          inclusionOverrides,
                          deletedIds: deletedIds.includes(segment.id)
                            ? deletedIds
                            : [...deletedIds, segment.id],
                        });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
