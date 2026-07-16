"use client";

import { useEffect, useState } from "react";
import { Loader2, Mic, Pause, Play, Plus, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioLevel } from "@/features/scribe/recording/use-audio-level.js";
import { AudioLevelMeter } from "@/features/scribe/components/recording/AudioLevelMeter.jsx";
import { ScribeConversationChat } from "./ScribeConversationChat.jsx";
import { Button } from "@/components/ui/button";
import {
  RECORD_PANEL_CONTEXT,
  resolveRecordPanelCopy,
} from "../../lib/record-panel-session-context.js";

export function ScribeRecordPanel({
  recordState = "idle",
  durationLabel,
  statusMessage,
  disabled,
  analyserNode,
  pauseSupported = true,
  transcriptSegments = [],
  highlightedSegmentId = null,
  transcriptLoading,
  transcriptLoadingMessage,
  canStartNewSession,
  onStart,
  onPause,
  onResume,
  onStop,
  onNewSession,
  manualMode = false,
  onManualModeChange,
  onManualSubmit,
  manualSubmitting = false,
  canStartRecording = true,
  patientRequiredHint,
  languageToggle,
  footer,
  sessionContext = RECORD_PANEL_CONTEXT.IDLE,
}) {
  const [manualText, setManualText] = useState("");

  useEffect(() => {
    if (!manualMode) setManualText("");
  }, [manualMode]);

  const isIdle = recordState === "idle";
  const isRequesting = recordState === "requesting";
  const isRecording = recordState === "recording";
  const isPaused = recordState === "paused";
  const isProcessing = recordState === "processing";
  const isLive = isRecording || isPaused;

  const { level, waveformData } = useAudioLevel(analyserNode, isLive && !manualMode);

  const panelCopy = resolveRecordPanelCopy(sessionContext, {
    isProcessing,
    isRequesting,
    isPaused,
    isRecording,
  });
  const statusTitle = manualMode ? "Manual transcript" : panelCopy.title;
  const sessionHint = manualMode ? null : panelCopy.hint;

  const showRecordingControls = !manualMode;
  const canUseManualEntry = (isIdle || isRequesting) && !disabled && !manualSubmitting;

  const enterManualMode = () => onManualModeChange?.(true);
  const exitManualMode = () => onManualModeChange?.(false);

  const handleManualGenerate = () => {
    const text = manualText.trim();
    if (!text || manualSubmitting) return;
    onManualSubmit?.(text);
  };

  return (
    <aside className="flex h-full min-h-0 w-full shrink-0 flex-col border-r border-gray-200 bg-gray-50 md:w-[40%]">
      {isLive && (
        <div
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900"
          data-testid="recording-leave-warning"
          role="status"
        >
          Recording in progress — don&apos;t close this tab
        </div>
      )}
      <div className="flex shrink-0 flex-col items-center gap-4 border-b border-gray-200 px-4 py-5">
        {showRecordingControls && isLive && (
          <AudioLevelMeter
            level={level}
            waveformData={waveformData}
            isActive
            isPaused={isPaused}
            className="w-full"
          />
        )}

        {manualMode ? (
          <div className="flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={exitManualMode}
              disabled={manualSubmitting}
              className="self-start text-sm text-gray-400 underline cursor-pointer hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ← Use microphone instead
            </button>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              disabled={manualSubmitting}
              placeholder="Paste or type the doctor-patient conversation here..."
              className={cn(
                "min-h-[200px] w-full resize-y rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900",
                "placeholder:text-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            />
            <button
              type="button"
              disabled={!manualText.trim() || manualSubmitting}
              onClick={handleManualGenerate}
              className={cn(
                "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3",
                "bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20",
                "transition-all duration-200 hover:bg-primary/90",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {manualSubmitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate SOAP Note"
              )}
            </button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">{statusTitle}</p>
              {sessionHint && !isLive && !isProcessing && (
                <p className="mt-1 max-w-[260px] text-xs text-gray-500">{sessionHint}</p>
              )}
              {durationLabel && isLive && (
                <p className="mt-0.5 font-mono text-xs tabular-nums text-gray-500">{durationLabel}</p>
              )}
              {statusMessage && !transcriptLoading && (
                <p className="mt-1 text-xs text-gray-500">{statusMessage}</p>
              )}
            </div>

            <div className="flex w-full max-w-[240px] flex-col items-center gap-2">
              {(isIdle || isRequesting) && !disabled && (
                <>
                  <button
                    type="button"
                    aria-label="Start recording"
                    disabled={disabled || isProcessing || isRequesting || !canStartRecording}
                    onClick={onStart}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3",
                      "bg-primary text-sm font-semibold text-white shadow-md shadow-primary/20",
                      "transition-all duration-200 hover:bg-primary/90",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                  >
                    {isRequesting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Mic className="h-5 w-5" />
                    )}
                    {isRequesting ? "Starting…" : "Start Recording"}
                  </button>
                  {!canStartRecording && patientRequiredHint && (
                    <p className="text-center text-xs text-gray-500">{patientRequiredHint}</p>
                  )}
                </>
              )}

              {isProcessing && (
                <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-5 py-3 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing…
                </div>
              )}

              {disabled && !isLive && !isProcessing && sessionHint && (
                <div
                  className={cn(
                    "w-full rounded-xl border border-dashed px-4 py-3 text-center text-xs",
                    sessionContext === RECORD_PANEL_CONTEXT.APPROVED_REVIEW
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-gray-300 bg-white text-gray-500",
                  )}
                  data-testid="record-panel-session-hint"
                >
                  {sessionHint}
                </div>
              )}

              {isLive && (
                <div className="flex w-full gap-2">
                  {pauseSupported && (
                    <button
                      type="button"
                      aria-label={isPaused ? "Resume recording" : "Pause recording"}
                      onClick={isPaused ? onResume : onPause}
                      className={cn(
                        "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3",
                        "text-sm font-semibold text-white shadow-md transition-all duration-200",
                        isPaused
                          ? "bg-emerald-600 shadow-emerald-600/20 hover:bg-emerald-700"
                          : "bg-amber-500 shadow-amber-500/20 hover:bg-amber-600",
                      )}
                    >
                      {isPaused ? (
                        <>
                          <Play className="h-4 w-4 fill-current" />
                          Resume
                        </>
                      ) : (
                        <>
                          <Pause className="h-4 w-4" />
                          Pause
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Stop recording"
                    onClick={onStop}
                    className={cn(
                      "flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-3",
                      "bg-red-600 text-sm font-semibold text-white shadow-md shadow-red-600/20",
                      "transition-all duration-200 hover:bg-red-700",
                      !pauseSupported && "w-full",
                    )}
                  >
                    <Square className="h-4 w-4 fill-current" />
                    Stop
                  </button>
                </div>
              )}
            </div>

            {(isIdle || isRequesting) && !disabled && !manualMode && (
              <>
                <p className="max-w-[240px] text-center text-xs leading-relaxed text-gray-500">
                  Speak clearly and louder. Minimum recording length is 10 seconds.
                </p>
                {languageToggle && (
                  <div className="flex w-full max-w-[280px] justify-center">{languageToggle}</div>
                )}
                {canUseManualEntry && (
                  <button
                    type="button"
                    onClick={enterManualMode}
                    className="text-sm text-gray-400 underline cursor-pointer hover:text-gray-600"
                  >
                    Or enter transcript manually
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conversation</p>
        </div>
        <ScribeConversationChat
          segments={transcriptSegments}
          highlightedSegmentId={highlightedSegmentId}
          loading={transcriptLoading}
          loadingMessage={transcriptLoadingMessage ?? statusMessage}
        />
      </div>

      <div className="shrink-0 space-y-3 border-t border-gray-200 px-4 py-4">
        {canStartNewSession && (
          <Button
            type="button"
            className="w-full cursor-pointer gap-2"
            onClick={onNewSession}
          >
            <Plus className="h-4 w-4" />
            New Session
          </Button>
        )}
        {footer}
      </div>
    </aside>
  );
}
