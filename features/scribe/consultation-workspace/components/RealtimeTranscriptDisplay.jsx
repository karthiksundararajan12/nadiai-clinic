"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * RealtimeTranscriptDisplay - Shows live transcript updates with streaming effect
 * Displays partial/interim results with visual feedback for confidence and streaming status
 */
export function RealtimeTranscriptDisplay({
  isStreaming = false,
  segments = [],
  interimText = "",
  interimConfidence = null,
  currentSpeaker = "A",
  speakerLabels = { A: "Doctor", B: "Patient" },
  onSegmentUpdate,
  className = "",
}) {
  const containerRef = useRef(null);
  const [displaySegments, setDisplaySegments] = useState([]);
  const [scrollToBottom, setScrollToBottom] = useState(true);

  // Auto-scroll to latest content
  useEffect(() => {
    if (scrollToBottom && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [displaySegments, interimText, scrollToBottom]);

  // Update display segments
  useEffect(() => {
    setDisplaySegments(segments);
  }, [segments]);

  // Handle scroll to disable auto-scroll if user scrolls up
  const handleScroll = useCallback((e) => {
    const element = e.target;
    const isAtBottom = Math.abs(
      element.scrollHeight - element.scrollTop - element.clientHeight
    ) < 50;
    setScrollToBottom(isAtBottom);
  }, []);

  return (
    <div
      className={cn(
        "relative flex flex-1 flex-col min-h-0 overflow-hidden",
        className
      )}
    >
      {/* Transcript container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className="space-y-3 p-4">
          {displaySegments.length === 0 && !interimText ? (
            <div className="flex items-center justify-center h-full text-center py-12">
              <div className="space-y-2">
                <div className="rounded-full bg-muted p-3 mx-auto w-fit">
                  <Zap className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {isStreaming
                    ? "Listening... waiting for first words"
                    : "Start recording to see live transcript"}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Finalized segments */}
              {displaySegments.map((segment, index) => (
                <RealtimeSegmentBlock
                  key={segment.id || index}
                  segment={segment}
                  speakerLabel={
                    speakerLabels[segment.speaker] || segment.speaker_label
                  }
                  isFinal={true}
                />
              ))}

              {/* Interim/streaming content */}
              {interimText && (
                <RealtimeSegmentBlock
                  segment={{
                    text: interimText,
                    speaker: currentSpeaker,
                    confidence: interimConfidence,
                    is_low_confidence: interimConfidence != null && interimConfidence < 0.7,
                  }}
                  speakerLabel={speakerLabels[currentSpeaker] || "Speaker"}
                  isFinal={false}
                  isStreaming={isStreaming}
                />
              )}

              {/* Streaming indicator */}
              {isStreaming && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-2">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"
                        style={{ animationDelay: `${i * 0.15}s` }}
                      />
                    ))}
                  </div>
                  <span>Transcribing live...</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Auto-scroll indicator */}
      {!scrollToBottom && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={() => {
              setScrollToBottom(true);
              if (containerRef.current) {
                containerRef.current.scrollTop =
                  containerRef.current.scrollHeight;
              }
            }}
            className="text-xs bg-primary/80 hover:bg-primary text-primary-foreground px-3 py-1.5 rounded-full font-medium transition-colors"
          >
            New messages - scroll down
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * RealtimeSegmentBlock - A single segment block with streaming animation
 */
function RealtimeSegmentBlock({
  segment,
  speakerLabel,
  isFinal = true,
  isStreaming = false,
}) {
  const confidentClass =
    segment.confidence != null && segment.confidence > 0.85
      ? "opacity-100"
      : segment.confidence != null && segment.confidence > 0.7
        ? "opacity-80"
        : "opacity-70";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-all duration-300",
        isFinal
          ? "border-border/50 bg-card/60"
          : "border-primary/30 bg-primary/5 shadow-sm",
        isStreaming && "animate-pulse"
      )}
    >
      {/* Speaker label and metadata */}
      <div className="flex items-center gap-2 mb-2">
        <span className={cn(
          "text-xs font-semibold rounded px-2 py-0.5",
          isFinal
            ? "bg-muted text-muted-foreground"
            : "bg-primary/20 text-primary"
        )}>
          {speakerLabel}
        </span>

        {!isFinal && (
          <>
            <span className="text-[10px] text-amber-600 bg-amber-100/60 rounded px-1.5 py-0.5">
              Live
            </span>
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
          </>
        )}

        {isFinal && segment.confidence != null && segment.is_low_confidence && (
          <span className="text-[10px] font-medium text-amber-700 bg-amber-100/70 rounded px-1.5 py-0.5">
            {Math.round(segment.confidence * 100)}% confidence
          </span>
        )}
      </div>

      {/* Transcript text */}
      <p className={cn(
        "text-sm leading-relaxed whitespace-pre-wrap",
        confidentClass,
        !isFinal && isStreaming && "animate-pulse"
      )}>
        {segment.text}
        {isStreaming && !isFinal && <span className="animate-pulse">▋</span>}
      </p>
    </div>
  );
}

/**
 * LiveTranscriptionBanner - Shows transcription status and stats
 */
export function LiveTranscriptionBanner({
  isRecording = false,
  isStreaming = false,
  totalSegments = 0,
  duration = 0,
  lowConfidenceCount = 0,
}) {
  const minutes = Math.floor(duration / 60);
  const seconds = duration % 60;

  if (!isRecording) return null;

  return (
    <div className="border-b border-border/50 bg-gradient-to-r from-primary/5 to-accent/5 px-4 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {isStreaming && (
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-primary animate-pulse"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          )}
          <span className="text-sm font-medium text-foreground">
            {isStreaming ? "Live transcription" : "Recording"}
          </span>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div>
            {minutes.toString().padStart(2, "0")}:
            {seconds.toString().padStart(2, "0")}
          </div>
          <div className="flex items-center gap-2">
            <span>{totalSegments} segments</span>
            {lowConfidenceCount > 0 && (
              <span className="text-amber-600 font-medium">
                • {lowConfidenceCount} unclear
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default RealtimeTranscriptDisplay;
