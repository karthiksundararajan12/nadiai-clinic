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
      <div className="scribe-card shrink-0 overflow-hidden rounded-xl">
        {children}
        <div className="flex flex-col items-center border-t border-[color:var(--scribe-card-border)] px-4 pb-5 pt-4">
        {manualMode ? (
          <div className="flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={exitManualMode}
              disabled={manualSubmitting}
              className="cursor-pointer self-start text-sm font-semibold text-[color:var(--scribe-indigo-600)] underline hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              ← Use microphone instead
            </button>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              disabled={manualSubmitting}
              placeholder="Paste or type the doctor-patient conversation here..."
              className={cn(
                "min-h-[160px] w-full resize-y rounded-lg border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] p-3 text-sm font-medium text-foreground",
                "placeholder:scribe-text-muted focus:border-[color:var(--scribe-indigo-600)] focus:outline-none focus:ring-2 focus:ring-[color:var(--scribe-indigo-100)]",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            />
            <button
              type="button"
              disabled={!manualText.trim() || manualSubmitting}
              onClick={handleManualGenerate}
              className={cn(
                "scribe-mic-button flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-5 py-3",
                "text-sm font-bold text-white",
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
            <div className="flex h-7 items-center justify-center">
              {showRecordingControls && isLive && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-sm font-bold tracking-wide text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />
                  REC {durationLabel || "00:00"}
                </span>
              )}
            </div>

            <div className="relative flex h-24 w-24 items-center justify-center">
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
                    "scribe-mic-button relative z-10 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full",
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
                  className="relative z-10 flex h-24 w-24 cursor-pointer items-center justify-center rounded-full bg-red-600 text-white shadow-md shadow-red-600/25 transition-all duration-200 hover:bg-red-700"
                >
                  <Stop size={28} weight="bold" />
                </button>
              )}
              {isProcessing && (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[color:var(--scribe-indigo-50)] text-[color:var(--scribe-indigo-600)]">
                  <CircleNotch size={32} weight="bold" className="animate-spin" />
                </div>
              )}
              {disabled && !isLive && !isProcessing && (
                <div
                  className="h-24 w-24 rounded-full bg-[color:var(--scribe-indigo-50)] opacity-60"
                  aria-hidden
                />
              )}
            </div>

            <div className="mt-3 flex w-full max-w-[280px] flex-col items-center gap-1 text-center">
              {isLive && (
                <>
                  <p className="text-sm font-bold text-[color:var(--scribe-heading)]">Stop recording</p>
                  <p className="scribe-text-muted text-sm font-medium">
                    Capturing ambient doctor-patient dialogue
                  </p>
                  <p className="scribe-text-muted text-sm font-medium">Minimum 10 seconds</p>
                </>
              )}
              {(isIdle || isRequesting) && !disabled && (
                <>
                  <p className="text-sm font-bold text-[color:var(--scribe-heading)]">Start recording</p>
                  {micReady ? (
                    <p className="text-sm font-semibold text-[color:var(--scribe-indigo-600)]">
                      Ready • Click the mic to record
                    </p>
                  ) : !canStartRecording ? (
                    <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-sm font-semibold text-amber-900">
                      <WarningCircle size={16} weight="bold" aria-hidden />
                      {patientRequiredHint || "Select a patient to begin"}
                    </span>
                  ) : null}
                  {isRequesting && (
                    <p className="scribe-text-muted text-sm font-medium">{statusTitle}</p>
                  )}
                  <p className="scribe-text-muted text-sm font-medium">Minimum 10 seconds</p>
                </>
              )}
              {isProcessing && (
                <p className="scribe-text-muted text-sm font-medium">
                  {statusMessage || "Processing…"}
                </p>
              )}
              {disabled && !isLive && !isProcessing && (statusTitle || sessionHint) && (
                <div
                  className={cn(
                    "w-full rounded-xl border border-dashed px-4 py-3 text-center text-sm font-medium",
                    sessionContext === RECORD_PANEL_CONTEXT.APPROVED_REVIEW
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] scribe-text-muted",
                  )}
                  data-testid="record-panel-session-hint"
                >
                  <p className="font-medium text-heading">{statusTitle}</p>
                  {sessionHint && <p className="mt-1">{sessionHint}</p>}
                </div>
              )}
              {statusMessage && !transcriptLoading && !isProcessing && isLive && (
                <p className="scribe-text-muted text-sm font-medium">{statusMessage}</p>
              )}
            </div>

            {isLive && pauseSupported && (
              <div className="mt-3 flex w-full max-w-[280px] justify-center">
                <button
                  type="button"
                  aria-label={isPaused ? "Resume recording" : "Pause recording"}
                  onClick={isPaused ? onResume : onPause}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] px-4 py-2 text-sm font-semibold text-[color:var(--scribe-heading)] transition-colors hover:bg-[color:var(--scribe-indigo-50)]"
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
              <div className="mt-3 flex w-full max-w-[280px] justify-center">{languageToggle}</div>
            )}

            {canUseManualEntry && (
              <button
                type="button"
                onClick={enterManualMode}
                className="mt-3 cursor-pointer text-sm font-semibold text-[color:var(--scribe-indigo-600)] hover:underline"
              >
                Enter transcript manually
              </button>
            )}
          </>
        )}
        </div>

        {isLive && (
          <div
            className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-semibold text-amber-900"
            data-testid="recording-leave-warning"
            role="status"
          >
            Recording in progress — don&apos;t close this tab
          </div>
        )}

        {(canStartNewSession || footer) && (
          <div className="space-y-3 border-t border-[color:var(--scribe-card-border)] px-4 py-4">
            {canStartNewSession && (
              <Button
                type="button"
                className="scribe-mic-button w-full cursor-pointer gap-2 border-0 text-sm font-bold shadow-none hover:opacity-95"
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

      <div className="scribe-card mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl" data-testid="record-panel-conversation">
        {statusStrip}
        <ScribeConversationChat
          segments={transcriptPending ? [] : transcriptSegments}
          highlightedSegmentId={highlightedSegmentId}
          loading={!transcriptPending && transcriptLoading}
          loadingMessage={transcriptLoadingMessage ?? statusMessage}
          isLiveRecording={transcriptPending}
          animateWaveform={isRecording}
          hasPatient={canStartRecording}
          clinicalById={clinicalById}
          onSelectionChange={onSoapTurnSelectionChange}
        />
      </div>
    </aside>
  );
}
