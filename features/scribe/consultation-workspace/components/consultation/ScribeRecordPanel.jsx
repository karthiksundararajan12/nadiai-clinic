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
    "relative z-10 flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-full";

  const newSessionButton = canStartNewSession ? (
    <Button
      type="button"
      size="sm"
      className="scribe-mic-button h-9 min-h-9 shrink-0 cursor-pointer gap-1.5 border-0 px-3 text-sm font-bold shadow-none hover:opacity-95"
      onClick={onNewSession}
    >
      <Plus size={16} weight="bold" />
      New Session
    </Button>
  ) : null;

  return (
    <aside className="relative flex h-full min-h-[16rem] w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden lg:min-h-0">
      <div
        className="scribe-card flex h-[calc(100dvh-16rem)] max-h-[calc(100dvh-16rem)] min-h-[16rem] w-full min-w-0 flex-none flex-col overflow-hidden rounded-xl lg:h-auto lg:max-h-none lg:min-h-[16rem] lg:flex-1"
        data-testid="record-panel-conversation"
      >
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

      <div className="scribe-card shrink-0 overflow-hidden rounded-xl" data-testid="record-panel-controls">
        {children}
        <div
          className={cn(
            "flex flex-col gap-2 border-t border-[color:var(--scribe-card-border)] px-3 py-2",
            manualMode && "pb-3",
          )}
        >
        {manualMode ? (
          <div className="flex w-full min-w-0 flex-col gap-2">
            <button
              type="button"
              onClick={exitManualMode}
              disabled={manualSubmitting}
              className="inline-flex min-h-9 cursor-pointer items-center self-start text-sm font-semibold text-[color:var(--scribe-indigo-600)] underline hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ← Use microphone instead
            </button>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              disabled={manualSubmitting}
              placeholder="Paste or type the doctor-patient conversation here..."
              className={cn(
                "max-h-32 min-h-[4.5rem] w-full resize-y rounded-lg border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] p-2 text-sm font-medium text-foreground",
                "placeholder:scribe-text-muted focus:border-[color:var(--scribe-indigo-600)] focus:outline-none focus:ring-2 focus:ring-[color:var(--scribe-indigo-100)]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            />
            <button
              type="button"
              disabled={!manualText.trim() || manualSubmitting}
              onClick={handleManualGenerate}
              className={cn(
                "scribe-mic-button flex min-h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2",
                "text-sm font-bold text-white",
                "transition-all duration-200 hover:opacity-95",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {manualSubmitting ? (
                <>
                  <CircleNotch size={18} weight="bold" className="animate-spin" />
                  Generating…
                </>
              ) : (
                "Generate SOAP Note"
              )}
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
              {micReady && (
                <span
                  className="scribe-mic-ring pointer-events-none absolute -inset-1 animate-pulse rounded-full ring-2"
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
                    <CircleNotch size={18} weight="bold" className="animate-spin" />
                  ) : (
                    <Microphone size={18} weight="duotone" />
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
                    "cursor-pointer bg-red-600 text-white shadow-sm shadow-red-600/25 transition-all duration-200 hover:bg-red-700",
                  )}
                >
                  <Stop size={16} weight="bold" />
                </button>
              )}
              {isProcessing && (
                <div className={cn(micControlClass, "bg-[color:var(--scribe-indigo-50)] text-[color:var(--scribe-indigo-600)]")}>
                  <CircleNotch size={18} weight="bold" className="animate-spin" />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              {showRecordingControls && isLive && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold tracking-wide text-red-600">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />
                  REC {durationLabel || "00:00"}
                </span>
              )}
              {isLive && (
                <p className="min-w-0 truncate text-sm font-semibold text-[color:var(--scribe-heading)]">
                  Stop recording
                </p>
              )}
              {(isIdle || isRequesting) && !disabled && (
                <p className="min-w-0 truncate text-sm font-semibold text-[color:var(--scribe-heading)]">
                  {isRequesting ? statusTitle : micReady ? "Ready to record" : "Start recording"}
                </p>
              )}
              {(isIdle || isRequesting) && !disabled && !canStartRecording && (
                <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  <WarningCircle size={14} weight="bold" className="shrink-0" aria-hidden />
                  <span className="truncate">{patientRequiredHint || "Select a patient to begin"}</span>
                </span>
              )}
              {isProcessing && (
                <p className="scribe-text-muted min-w-0 truncate text-sm font-medium">
                  {statusMessage || "Processing…"}
                </p>
              )}
              {disabled && !isLive && !isProcessing && statusTitle && (
                <p
                  className="min-w-0 truncate text-sm font-medium text-[color:var(--scribe-heading)]"
                  data-testid="record-panel-session-hint"
                  title={sessionHint || undefined}
                >
                  {statusTitle}
                </p>
              )}
              {statusMessage && !transcriptLoading && !isProcessing && isLive && (
                <p className="scribe-text-muted min-w-0 truncate text-sm font-medium">{statusMessage}</p>
              )}
            </div>

            {isLive && pauseSupported && (
              <button
                type="button"
                aria-label={isPaused ? "Resume recording" : "Pause recording"}
                onClick={isPaused ? onResume : onPause}
                className="inline-flex h-9 min-h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] px-3 text-sm font-semibold text-[color:var(--scribe-heading)] transition-colors hover:bg-[color:var(--scribe-indigo-50)]"
              >
                {isPaused ? (
                  <Play size={16} weight="bold" className="scribe-icon" />
                ) : (
                  <Pause size={16} weight="bold" className="scribe-icon" />
                )}
                {isPaused ? "Resume" : "Pause"}
              </button>
            )}

            {languageToggle && !isLive && !isProcessing && (isIdle || isRequesting) && !disabled && (
              <div className="min-w-[8rem] flex-1">{languageToggle}</div>
            )}

            {canUseManualEntry && (
              <button
                type="button"
                onClick={enterManualMode}
                className="inline-flex h-9 min-h-9 shrink-0 cursor-pointer items-center text-sm font-semibold text-[color:var(--scribe-indigo-600)] hover:underline"
              >
                Enter manually
              </button>
            )}

            {newSessionButton}
          </div>
        )}

        {isLive && (
          <p
            className="truncate text-xs font-semibold text-amber-900"
            data-testid="recording-leave-warning"
            role="status"
          >
            Recording in progress — don&apos;t close this tab
          </p>
        )}

        {manualMode && (newSessionButton || footer) && (
          <div className="flex items-center justify-end gap-2">
            {newSessionButton}
            {footer}
          </div>
        )}
        {!manualMode && footer ? <div className="min-w-0">{footer}</div> : null}
        </div>
      </div>
    </aside>
  );
}
