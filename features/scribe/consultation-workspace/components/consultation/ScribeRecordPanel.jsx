"use client";

import { useEffect, useState } from "react";
import {
  CircleNotch,
  Microphone,
  Pause,
  Play,
  Plus,
  Stop,
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
  patientAttached = canStartRecording,
  onAddPatient,
  patientRequiredHint,
  notices = [],
  vitalsSlot = null,
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
  const [patientPrompt, setPatientPrompt] = useState(false);

  useEffect(() => {
    if (!manualMode) setManualText("");
  }, [manualMode]);

  useEffect(() => {
    if (canStartRecording) setPatientPrompt(false);
  }, [canStartRecording]);

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

  const requirePatient = () => {
    setPatientPrompt(true);
  };

  const enterManualMode = () => {
    if (!canStartRecording) {
      requirePatient();
      return;
    }
    onManualModeChange?.(true);
  };
  const exitManualMode = () => onManualModeChange?.(false);

  const handleStartClick = () => {
    if (!canStartRecording) {
      requirePatient();
      return;
    }
    onStart?.();
  };

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
      {children || vitalsSlot ? (
        <div className="scribe-card shrink-0 overflow-visible rounded-xl" data-testid="record-panel-patient">
          {children}
          {vitalsSlot ? (
            <div className="border-t border-[color:var(--scribe-card-border)] px-3 py-2">
              {vitalsSlot}
            </div>
          ) : null}
        </div>
      ) : null}
      {patientPrompt || notices.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-2" data-testid="scribe-alert-slot">
          {patientPrompt ? (
            <ScribeInlineAlert
              message={patientRequiredHint || "Select a patient to begin"}
              testId="record-patient-required"
              onDismiss={() => setPatientPrompt(false)}
            />
          ) : null}
          {notices.map((notice) => (
            <ScribeInlineAlert
              key={notice.id}
              message={notice.message}
              testId="scribe-inline-alert"
              actionLabel={notice.actionLabel}
              onAction={notice.onAction}
              onDismiss={notice.onDismiss}
            />
          ))}
        </div>
      ) : null}
      <div
        className="scribe-card flex h-[calc(100dvh-20rem)] max-h-[calc(100dvh-20rem)] min-h-[16rem] w-full min-w-0 flex-none flex-col overflow-hidden rounded-xl lg:h-auto lg:max-h-none lg:min-h-[16rem] lg:flex-1"
        data-testid="record-panel-conversation"
      >
        {statusStrip}
        {!patientAttached ? (
          <div
            className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950"
            data-testid="unassigned-patient-banner"
          >
            <p className="min-w-0 flex-1">No patient selected. Name and age will be picked up from the conversation, or add manually.</p>
            <button
              type="button"
              className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-[color:var(--scribe-indigo-600)]"
              onClick={onAddPatient}
            >
              <Plus size={16} weight="bold" aria-hidden />
              New patient
            </button>
          </div>
        ) : null}
        <ScribeConversationChat
          segments={transcriptSegments}
          highlightedSegmentId={highlightedSegmentId}
          loading={!transcriptPending && transcriptLoading}
          loadingMessage={transcriptLoadingMessage ?? statusMessage}
          isLiveRecording={transcriptPending}
          animateWaveform={isRecording}
          hasPatient={patientAttached}
          clinicalById={clinicalById}
          onSelectionChange={onSoapTurnSelectionChange}
          sessionStatus={sessionStatus}
        />
      </div>

      <div className="scribe-card shrink-0 overflow-visible rounded-xl" data-testid="record-panel-controls">
        <div
          className={cn(
            "flex flex-col gap-2 px-3 py-2",
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
          <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
                  disabled={disabled || isProcessing || isRequesting}
                  onClick={handleStartClick}
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

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {showRecordingControls && isLive && (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold tracking-wide text-red-600">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" aria-hidden />
                  REC {durationLabel || "00:00"}
                </span>
              )}
              {isLive && (
                <p className="shrink-0 text-sm font-semibold text-[color:var(--scribe-heading)]">
                  Stop recording
                </p>
              )}
              {(isIdle || isRequesting) && !disabled && (
                <p className="shrink-0 text-sm font-semibold text-[color:var(--scribe-heading)]">
                  {isRequesting ? statusTitle : "Start recording"}
                </p>
              )}
              {isProcessing && (
                <p className="scribe-text-muted text-sm font-medium">
                  {statusMessage || "Processing…"}
                </p>
              )}
              {disabled && !isLive && !isProcessing && statusTitle && (
                <p
                  className="text-sm font-medium text-[color:var(--scribe-heading)]"
                  data-testid="record-panel-session-hint"
                  title={sessionHint || undefined}
                >
                  {statusTitle}
                </p>
              )}
              {statusMessage && !transcriptLoading && !isProcessing && isLive && (
                <p className="scribe-text-muted text-sm font-medium">{statusMessage}</p>
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

            {canUseManualEntry && (
              <button
                type="button"
                onClick={enterManualMode}
                className="inline-flex h-9 min-h-9 shrink-0 cursor-pointer items-center whitespace-nowrap text-sm font-semibold text-[color:var(--scribe-indigo-600)] hover:underline"
              >
                Enter manually
              </button>
            )}

            {newSessionButton}
          </div>
          {languageToggle && !isLive && !isProcessing && (isIdle || isRequesting) && !disabled && (
            <div className="w-full">{languageToggle}</div>
          )}
          </div>
        )}

        {isLive && (
          <p
            className="text-xs font-semibold text-amber-900"
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

function ScribeInlineAlert({ message, onDismiss, testId, actionLabel, onAction }) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
    >
      <p className="min-w-0 flex-1 break-words">{message}</p>
      {actionLabel && onAction ? (
        <button
          type="button"
          className="shrink-0 cursor-pointer underline"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      ) : null}
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded px-1 text-base leading-none text-amber-900 hover:bg-amber-100"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
