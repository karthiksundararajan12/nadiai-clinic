"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Loader2, Mic, Pause, Play, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAudioLevel } from "@/features/scribe/recording/use-audio-level.js";
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
  statusStrip = null,
  sessionContext = RECORD_PANEL_CONTEXT.IDLE,
  children = null,
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
  const transcriptPending = isLive || isRequesting;

  useAudioLevel(analyserNode, isLive && !manualMode);

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
  const micReady = canStartRecording && isIdle && !disabled && !isRequesting;

  const enterManualMode = () => onManualModeChange?.(true);
  const exitManualMode = () => onManualModeChange?.(false);

  const handleManualGenerate = () => {
    const text = manualText.trim();
    if (!text || manualSubmitting) return;
    onManualSubmit?.(text);
  };

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-1 flex-col">
      <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-card shadow-clinical">
        {children}
        <div className="flex flex-col items-center border-t border-border px-4 pb-5 pt-4">
        {manualMode ? (
          <div className="flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={exitManualMode}
              disabled={manualSubmitting}
              className="cursor-pointer self-start text-xs text-primary underline hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ← Use microphone instead
            </button>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              disabled={manualSubmitting}
              placeholder="Paste or type the doctor-patient conversation here..."
              className={cn(
                "min-h-[160px] w-full resize-y rounded-lg border border-border bg-card p-3 text-xs text-foreground",
                "placeholder:text-gray-500 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            />
            <button
              type="button"
              disabled={!manualText.trim() || manualSubmitting}
              onClick={handleManualGenerate}
              className={cn(
                "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3",
                "bg-primary text-xs font-semibold text-primary-foreground shadow-md shadow-primary/20",
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
            <div className="flex h-7 items-center justify-center">
              {showRecordingControls && isLive && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-red-600 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />
                  REC {durationLabel || "00:00"}
                </span>
              )}
            </div>

            <div className="relative flex h-24 w-24 items-center justify-center">
              {micReady && (
                <span
                  className="pointer-events-none absolute -inset-1.5 animate-pulse rounded-full ring-4 ring-primary/30"
                  aria-hidden
                />
              )}
              {(isIdle || isRequesting) && !disabled && (
                <button
                  type="button"
                  aria-label="Start recording"
                  disabled={disabled || isProcessing || isRequesting || !canStartRecording}
                  onClick={onStart}
                  className={cn(
                    "relative z-10 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/25",
                    "transition-all duration-200 hover:bg-primary/90",
                    "disabled:cursor-not-allowed",
                    !canStartRecording && "opacity-40",
                  )}
                >
                  {isRequesting ? (
                    <Loader2 className="h-8 w-8 animate-spin" />
                  ) : (
                    <Mic className="h-8 w-8" />
                  )}
                </button>
              )}
              {isLive && (
                <button
                  type="button"
                  aria-label="Stop recording"
                  onClick={onStop}
                  className="relative z-10 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full bg-red-600 text-white shadow-md shadow-red-600/25 transition-all duration-200 hover:bg-red-700"
                >
                  <span className="h-5 w-5 rounded-[4px] bg-white" />
                </button>
              )}
              {isProcessing && (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted text-gray-600 dark:text-gray-300">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              )}
              {disabled && !isLive && !isProcessing && (
                <div className="h-24 w-24 rounded-full bg-muted" aria-hidden />
              )}
            </div>

            <div className="mt-3 flex w-full max-w-[280px] flex-col items-center gap-1 text-center">
              {isLive && (
                <>
                  <p className="text-sm font-semibold text-heading">Stop recording</p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    Capturing ambient doctor-patient dialogue
                  </p>
                  <p className="text-xs text-gray-700 dark:text-gray-300">Minimum 10 seconds</p>
                </>
              )}
              {(isIdle || isRequesting) && !disabled && (
                <>
                  <p className="text-sm font-semibold text-heading">Start recording</p>
                  {micReady ? (
                    <p className="text-xs font-medium text-primary">
                      Ready • Click the mic to record
                    </p>
                  ) : !canStartRecording ? (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                      <AlertCircle className="h-3 w-3" aria-hidden />
                      {patientRequiredHint || "Select a patient to begin"}
                    </span>
                  ) : null}
                  {isRequesting && (
                    <p className="text-xs text-gray-700 dark:text-gray-300">{statusTitle}</p>
                  )}
                  <p className="text-xs text-gray-700 dark:text-gray-300">Minimum 10 seconds</p>
                </>
              )}
              {isProcessing && (
                <p className="text-xs text-gray-700 dark:text-gray-300">
                  {statusMessage || "Processing…"}
                </p>
              )}
              {disabled && !isLive && !isProcessing && (statusTitle || sessionHint) && (
                <div
                  className={cn(
                    "w-full rounded-xl border border-dashed px-4 py-3 text-center text-xs",
                    sessionContext === RECORD_PANEL_CONTEXT.APPROVED_REVIEW
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "border-border bg-card text-gray-700 dark:text-gray-300",
                  )}
                  data-testid="record-panel-session-hint"
                >
                  <p className="font-medium text-heading">{statusTitle}</p>
                  {sessionHint && <p className="mt-1">{sessionHint}</p>}
                </div>
              )}
              {statusMessage && !transcriptLoading && !isProcessing && isLive && (
                <p className="text-xs text-gray-700 dark:text-gray-300">{statusMessage}</p>
              )}
            </div>

            {isLive && pauseSupported && (
              <div className="mt-3 flex w-full max-w-[280px] justify-center">
                <button
                  type="button"
                  aria-label={isPaused ? "Resume recording" : "Pause recording"}
                  onClick={isPaused ? onResume : onPause}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  {isPaused ? (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  ) : (
                    <Pause className="h-3.5 w-3.5" />
                  )}
                  {isPaused ? "Resume recording" : "Pause recording"}
                </button>
              </div>
            )}

            {languageToggle && !isLive && !isProcessing && (isIdle || isRequesting) && !disabled && (
              <div className="mt-3 flex w-full max-w-[280px] justify-center">{languageToggle}</div>
            )}

            {canUseManualEntry && (
              <button
                type="button"
                onClick={enterManualMode}
                className="mt-3 cursor-pointer text-xs font-medium text-primary hover:underline"
              >
                Enter transcript manually
              </button>
            )}
          </>
        )}
        </div>

        {isLive && (
          <div
            className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            data-testid="recording-leave-warning"
            role="status"
          >
            Recording in progress — don&apos;t close this tab
          </div>
        )}

        {(canStartNewSession || footer) && (
          <div className="space-y-3 border-t border-border px-4 py-4">
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
        )}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-clinical" data-testid="record-panel-conversation">
        {statusStrip}
        <ScribeConversationChat
          segments={transcriptPending ? [] : transcriptSegments}
          highlightedSegmentId={highlightedSegmentId}
          loading={!transcriptPending && transcriptLoading}
          loadingMessage={transcriptLoadingMessage ?? statusMessage}
          isLiveRecording={transcriptPending}
          animateWaveform={isRecording}
          hasPatient={canStartRecording}
        />
      </div>
    </aside>
  );
}
