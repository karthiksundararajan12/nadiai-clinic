"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CircleNotch, Waveform } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { formatTimestamp } from "../../../transcript-review/components/Timestamp.jsx";
import { resolveConversationChatView } from "../../lib/conversation-chat-view.js";
import { logScribeTiming } from "../../lib/scribe-client-log.js";

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
        "flex max-w-full items-center justify-center gap-1 overflow-hidden rounded-lg px-4",
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
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3">
      <p className="flex min-w-0 items-center gap-2.5 text-sm font-bold break-words text-[color:var(--scribe-heading)] min-[1920px]:text-lg">
        <span className="scribe-icon-tile h-9 w-9 shrink-0 min-[1920px]:h-11 min-[1920px]:w-11">
          <Waveform size={22} weight="duotone" className="scribe-icon" aria-hidden />
        </span>
        {isLiveRecording && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-red-600" aria-hidden />
        )}
        <span className="min-w-0 break-words">{title}</span>
      </p>
      {!isLiveRecording && (
        <p className="scribe-text-muted shrink-0 text-sm font-medium">{standby}</p>
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
  sessionStatus = null,
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

  const view = resolveConversationChatView({
    segments,
    loading,
    sessionStatus,
  });

  useEffect(() => {
    logScribeTiming("conversation-render", {
      sessionStatus: view.sessionStatus,
      transcriptLength: view.transcriptLength,
      branch: view.branch,
      loading: Boolean(loading),
    });
  }, [view.branch, view.sessionStatus, view.transcriptLength, loading]);

  function isIncluded(segment) {
    if (Object.prototype.hasOwnProperty.call(inclusionOverrides, segment.id)) {
      return inclusionOverrides[segment.id] === true;
    }
    return clinicalById[segment.id] !== false;
  }

  if (view.branch === "loading") {
    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto bg-[color:var(--scribe-card-bg)] px-4 py-4 text-left min-[1920px]:gap-4 min-[1920px]:px-6 min-[1920px]:py-6"
        data-conversation-branch="loading"
      >
        <ConversationHeading isLiveRecording={false} hasPatient={hasPatient} />
        <WaveformBars />
        <div className="flex min-w-0 items-center justify-center gap-2 py-4 text-center">
          <CircleNotch size={20} weight="bold" className="animate-spin scribe-icon shrink-0" />
          <p className="scribe-text-muted min-w-0 break-words text-sm font-medium min-[1920px]:text-lg">{loadingMessage ?? "Processing conversation…"}</p>
        </div>
      </div>
    );
  }

  if (view.branch === "placeholder") {
    return (
      <div
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto bg-[color:var(--scribe-card-bg)] px-4 py-4 min-[1920px]:gap-4 min-[1920px]:px-6 min-[1920px]:py-6"
        data-testid="conversation-placeholder"
        data-conversation-branch="placeholder"
      >
        <ConversationHeading isLiveRecording={isLiveRecording} hasPatient={hasPatient} />
        <WaveformBars animated={animateWaveform} live={isLiveRecording} />
        {isLiveRecording ? (
          <p className="scribe-text-muted break-words text-sm font-medium min-[1920px]:text-lg">
            Transcript will appear here once you stop recording.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[color:var(--scribe-card-bg)]"
      data-testid="transcript-review-workspace"
      data-conversation-branch="transcript"
    >
      <div className="shrink-0 border-b border-[color:var(--scribe-card-border)] px-4 py-3 min-[1920px]:px-6 min-[1920px]:py-4">
        <ConversationHeading isLiveRecording={false} hasPatient={hasPatient} />
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain px-3 py-3 min-[1920px]:px-5 min-[1920px]:py-5">
        <div className="space-y-3 min-[1920px]:space-y-4">
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
                  "scribe-card min-w-0 overflow-hidden rounded-lg px-3 py-2 transition-all duration-300 min-[1920px]:px-4 min-[1920px]:py-3",
                  isHighlighted && "animate-evidence-pulse ring-2 ring-[color:var(--scribe-indigo-100)] ring-offset-2",
                  !included && "opacity-50",
                )}
              >
                <div className="mb-1 flex min-w-0 items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "min-w-0 truncate text-sm font-bold uppercase tracking-wide min-[1920px]:text-base",
                      doctor ? "text-[color:var(--scribe-indigo-600)]" : "scribe-text-muted",
                    )}
                  >
                    {label}
                  </p>
                  <span className="scribe-text-muted shrink-0 font-mono text-sm font-medium tabular-nums">
                    {isInterim ? "draft" : formatTimestamp(segment.start_seconds ?? segment.start)}
                  </span>
                </div>
                <div
                  className={cn(
                    "min-w-0 text-sm font-medium leading-relaxed min-[1920px]:text-lg",
                    included ? "text-[color:var(--scribe-heading)]" : "scribe-text-muted",
                    isInterim && "italic scribe-text-muted",
                  )}
                  data-testid={isInterim ? "live-interim-transcript" : undefined}
                >
                  <p className={cn("break-words whitespace-pre-wrap", isInterim && "italic scribe-text-muted")}>
                    {segment.text}
                  </p>
                </div>
                {!isInterim && (
                  <div className="mt-2 flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <button
                      type="button"
                      aria-pressed={included}
                      data-testid={`include-in-note-${segment.id}`}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer items-center justify-center text-sm font-semibold sm:justify-end min-[1920px]:text-lg",
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
                      className="scribe-text-muted inline-flex min-h-11 cursor-pointer items-center justify-center text-sm font-semibold hover:text-[color:var(--scribe-heading)] sm:justify-end min-[1920px]:text-lg"
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
