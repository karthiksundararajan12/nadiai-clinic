"use client";

import { useEffect, useState } from "react";
import {
  CircleNotch,
  Microphone,
  Pause,
  Play,
  Plus,
  Stop,
  WarningCircle,
} from "@phosphor-icons/react";
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
  clinicalById,
  onSoapTurnSelectionChange,
  sessionStatus = null,
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

  const micControlClass =
    "relative z-10 flex h-14 w-14 min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full lg:h-24 lg:w-24 min-[1920px]:h-28 min-[1920px]:w-28";

  return (
    <aside className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-visible lg:overflow-hidden">
      <div className="flex min-h-0 w-full min-w-0 shrink flex-col lg:scribe-card lg:shrink-0 lg:overflow-hidden lg:rounded-xl">
        <div className="min-h-0 max-h-[min(16rem,46%)] overflow-x-hidden overflow-y-auto rounded-xl border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] shadow-[var(--shadow-clinical)] lg:max-h-[min(22rem,48%)] lg:shrink lg:overflow-y-auto lg:rounded-none lg:border-0 lg:bg-transparent lg:shadow-none">
        {children}
        </div>
        <div
          className={cn(
            "flex shrink-0 flex-col border-t border-[color:var(--scribe-card-border)]",
            !manualMode &&
              "max-lg:fixed max-lg:bottom-0 max-lg:z-30 max-lg:bg-[color:var(--scribe-card-bg)] max-lg:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-lg:shadow-[0_-8px_24px_rgb(79_70_229/0.12)] max-sm:inset-x-0 sm:max-lg:left-1/2 sm:max-lg:w-full sm:max-lg:max-w-2xl sm:max-lg:-translate-x-1/2",
          )}
        >
        <div
          className={cn(
            "flex flex-col items-center px-4 pt-3 lg:pt-4 min-[1920px]:px-6 min-[1920px]:pt-6",
            manualMode ? "pb-5 min-[1920px]:pb-8" : "lg:pb-5 min-[1920px]:pb-8",
          )}
        >
        {manualMode ? (
          <div className="flex w-full min-w-0 flex-col gap-3">
            <button
              type="button"
              onClick={exitManualMode}
              disabled={manualSubmitting}
              className="inline-flex min-h-11 cursor-pointer items-center self-start text-base font-semibold text-[color:var(--scribe-indigo-600)] underline hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 min-[1920px]:text-lg"
            >
              ← Use microphone instead
            </button>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              disabled={manualSubmitting}
              placeholder="Paste or type the doctor-patient conversation here..."
              className={cn(
                "max-h-[30vh] min-h-[120px] w-full resize-y rounded-lg border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] p-3 text-base font-medium text-foreground lg:max-h-none lg:min-h-[160px]",
                "min-[1920px]:min-h-[200px] min-[1920px]:text-lg",
                "placeholder:scribe-text-muted focus:border-[color:var(--scribe-indigo-600)] focus:outline-none focus:ring-2 focus:ring-[color:var(--scribe-indigo-100)]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            />
            <button
              type="button"
              disabled={!manualText.trim() || manualSubmitting}
              onClick={handleManualGenerate}
              className={cn(
                "scribe-mic-button flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3",
                "text-base font-bold text-white min-[1920px]:min-h-12 min-[1920px]:text-lg",
                "transition-all duration-200 hover:opacity-95",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {manualSubmitting ? (
                <>
                  <CircleNotch size={22} weight="bold" className="animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate SOAP Note"
              )}
            </button>
          </div>
        ) : (
          <>
            <div className="flex h-7 w-full items-center justify-center empty:hidden lg:empty:flex">
              {showRecordingControls && isLive && (
                <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-sm font-bold tracking-wide text-red-600 min-[1920px]:text-base">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />
                  REC {durationLabel || "00:00"}
                </span>
              )}
            </div>

            <div className="flex w-full min-w-0 items-center gap-3 lg:flex-col lg:gap-0">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center lg:h-24 lg:w-24 min-[1920px]:h-28 min-[1920px]:w-28">
              {micReady && (
                <span
                  className="scribe-mic-ring pointer-events-none absolute -inset-1.5 animate-pulse rounded-full ring-4"
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
                    "scribe-mic-button cursor-pointer",
                    micControlClass,
                    "transition-all duration-200 hover:opacity-95",
                    "disabled:cursor-not-allowed disabled:opacity-55",
                  )}
                >
                  {isRequesting ? (
                    <CircleNotch size={32} weight="bold" className="animate-spin" />
                  ) : (
                    <Microphone size={32} weight="duotone" />
                  )}
                </button>
              )}
              {isLive && (
                <button
                  type="button"
                  aria-label="Stop recording"
                  onClick={onStop}
                  className={cn(
                    micControlClass,
                    "cursor-pointer bg-red-600 text-white shadow-md shadow-red-600/25 transition-all duration-200 hover:bg-red-700",
                  )}
                >
                  <Stop size={28} weight="bold" />
                </button>
              )}
              {isProcessing && (
                <div className={cn(micControlClass, "bg-[color:var(--scribe-indigo-50)] text-[color:var(--scribe-indigo-600)]")}>
                  <CircleNotch size={32} weight="bold" className="animate-spin" />
                </div>
              )}
              {disabled && !isLive && !isProcessing && (
                <div
                  className="h-14 w-14 rounded-full bg-[color:var(--scribe-indigo-50)] opacity-60 lg:h-24 lg:w-24 min-[1920px]:h-28 min-[1920px]:w-28"
                  aria-hidden
                />
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col items-start gap-1 text-left lg:mt-3 lg:w-full lg:max-w-[280px] lg:flex-none lg:items-center lg:text-center min-[1920px]:max-w-sm min-[1920px]:gap-2">
              {isLive && (
                <>
                  <p className="break-words text-sm font-bold text-[color:var(--scribe-heading)] min-[1920px]:text-lg">Stop recording</p>
                  <p className="scribe-text-muted break-words text-sm font-medium">
                    Capturing ambient doctor-patient dialogue
                  </p>
                  <p className="scribe-text-muted break-words text-sm font-medium">Minimum 10 seconds</p>
                </>
              )}
              {(isIdle || isRequesting) && !disabled && (
                <>
                  <p className="break-words text-sm font-bold text-[color:var(--scribe-heading)] min-[1920px]:text-lg">Start recording</p>
                  {micReady ? (
                    <p className="break-words text-sm font-semibold text-[color:var(--scribe-indigo-600)] min-[1920px]:text-lg">
                      Ready • Click the mic to record
                    </p>
                  ) : !canStartRecording ? (
                    <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-left text-sm font-semibold break-words text-amber-900 min-[1920px]:text-base">
                      <WarningCircle size={16} weight="bold" className="shrink-0" aria-hidden />
                      {patientRequiredHint || "Select a patient to begin"}
                    </span>
                  ) : null}
                  {isRequesting && (
                    <p className="scribe-text-muted break-words text-sm font-medium">{statusTitle}</p>
                  )}
                  <p className="scribe-text-muted break-words text-sm font-medium">Minimum 10 seconds</p>
                </>
              )}
              {isProcessing && (
                <p className="scribe-text-muted break-words text-sm font-medium min-[1920px]:text-lg">
                  {statusMessage || "Processing…"}
                </p>
              )}
              {disabled && !isLive && !isProcessing && (statusTitle || sessionHint) && (
                <div
                  className={cn(
                    "w-full break-words rounded-xl border border-dashed px-4 py-3 text-center text-sm font-medium min-[1920px]:text-lg",
                    sessionContext === RECORD_PANEL_CONTEXT.APPROVED_REVIEW
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] scribe-text-muted",
                  )}
                  data-testid="record-panel-session-hint"
                >
                  <p className="break-words font-medium text-heading">{statusTitle}</p>
                  {sessionHint && <p className="mt-1 break-words">{sessionHint}</p>}
                </div>
              )}
              {statusMessage && !transcriptLoading && !isProcessing && isLive && (
                <p className="scribe-text-muted break-words text-sm font-medium">{statusMessage}</p>
              )}
            </div>
            </div>

            {isLive && pauseSupported && (
              <div className="mt-2 flex w-full justify-center lg:mt-3 lg:max-w-[280px] min-[1920px]:max-w-sm">
                <button
                  type="button"
                  aria-label={isPaused ? "Resume recording" : "Pause recording"}
                  onClick={isPaused ? onResume : onPause}
                  className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--scribe-heading)] transition-colors hover:bg-[color:var(--scribe-indigo-50)] lg:w-auto min-[1920px]:min-h-12 min-[1920px]:px-6 min-[1920px]:text-lg"
                >
                  {isPaused ? (
                    <Play size={18} weight="bold" className="scribe-icon" />
                  ) : (
                    <Pause size={18} weight="bold" className="scribe-icon" />
                  )}
                  {isPaused ? "Resume recording" : "Pause recording"}
                </button>
              </div>
            )}

            {languageToggle && !isLive && !isProcessing && (isIdle || isRequesting) && !disabled && (
              <div className="mt-3 flex w-full min-w-0 justify-center lg:max-w-[280px] min-[1920px]:max-w-sm">{languageToggle}</div>
            )}

            {canUseManualEntry && (
              <button
                type="button"
                onClick={enterManualMode}
                className="mt-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center text-sm font-semibold text-[color:var(--scribe-indigo-600)] hover:underline lg:mt-3 lg:w-auto min-[1920px]:min-h-12 min-[1920px]:text-lg"
              >
                Enter transcript manually
              </button>
            )}
          </>
        )}
        </div>

        {isLive && (
          <div
            className="break-words border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900 min-[1920px]:px-6 min-[1920px]:text-lg"
            data-testid="recording-leave-warning"
            role="status"
          >
            Recording in progress — don&apos;t close this tab
          </div>
        )}

        {(canStartNewSession || footer) && (
          <div className="space-y-3 border-t border-[color:var(--scribe-card-border)] px-4 py-3 lg:py-4 min-[1920px]:space-y-4 min-[1920px]:px-6">
            {canStartNewSession && (
              <Button
                type="button"
                className="scribe-mic-button min-h-11 w-full cursor-pointer gap-2 border-0 text-sm font-bold shadow-none hover:opacity-95 min-[1920px]:min-h-12 min-[1920px]:text-lg"
                onClick={onNewSession}
              >
                <Plus size={20} weight="bold" />
                New Session
              </Button>
            )}
            {footer}
          </div>
        )}
        </div>
      </div>

      <div className="scribe-card mt-4 flex min-h-[16rem] min-w-0 flex-1 flex-col overflow-hidden rounded-xl min-[1920px]:mt-6" data-testid="record-panel-conversation">
        {statusStrip}
        <ScribeConversationChat
          segments={transcriptSegments}
          highlightedSegmentId={highlightedSegmentId}
          loading={!transcriptPending && transcriptLoading}
          loadingMessage={transcriptLoadingMessage ?? statusMessage}
          isLiveRecording={transcriptPending}
          animateWaveform={isRecording}
          hasPatient={canStartRecording}
          clinicalById={clinicalById}
          onSelectionChange={onSoapTurnSelectionChange}
          sessionStatus={sessionStatus}
        />
      </div>
    </aside>
  );
}
