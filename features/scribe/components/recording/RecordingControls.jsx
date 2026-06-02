"use client";

/**
 * RecordingControls — the fully composed recording panel.
 *
 * This is the single component to drop into any page.
 * It wires together all hooks and sub-components into a cohesive,
 * production-ready recording UI.
 *
 * Props:
 *  - onRecordingComplete(chunks, mimeType)  — called when the user stops
 *  - onError(err)                           — optional error callback
 *  - sessionId                             — used for display / audit only
 *  - disabled                              — locks all controls
 *
 * Usage:
 *   <RecordingControls
 *     onRecordingComplete={(chunks, mimeType) => handleUpload(chunks, mimeType)}
 *   />
 */

import { useCallback }         from "react";
import { Info, FileAudio }     from "lucide-react";
import { cn }                  from "@/lib/utils";
import { useRecording }        from "@/features/scribe/recording/use-recording.js";
import { useAudioLevel }       from "@/features/scribe/recording/use-audio-level.js";
import { useDeviceSelection }  from "@/features/scribe/recording/use-device-selection.js";
import { RecordButton }        from "./RecordButton.jsx";
import { RecordingTimer }      from "./RecordingTimer.jsx";
import { AudioLevelMeter }     from "./AudioLevelMeter.jsx";
import { DeviceSelector }      from "./DeviceSelector.jsx";
import { PermissionPrompt }    from "./PermissionPrompt.jsx";
import { formatBytes }         from "./utils.js";

/**
 * @param {{
 *   onRecordingComplete?: (chunks: Blob[], mimeType: string, durationSeconds: number) => void;
 *   onError?:             (err: import("../../recording/errors.js").RecordingError) => void;
 *   sessionId?:           string;
 *   disabled?:            boolean;
 *   className?:           string;
 * }} props
 */
export function RecordingControls({
  onRecordingComplete,
  onError,
  sessionId,
  disabled  = false,
  className,
}) {
  // ── Device selection ────────────────────────────────────
  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshDevices,
    isLoading: devicesLoading,
  } = useDeviceSelection();

  // ── Recording ───────────────────────────────────────────
  const recording = useRecording({
    deviceId: selectedDeviceId,
    onError,
  });

  // Refresh device list once we have permission (labels now available)
  const handleStart = useCallback(async () => {
    await recording.startRecording();
    await refreshDevices();
  }, [recording, refreshDevices]);

  const handleStop = useCallback(async () => {
    const chunks = await recording.stopRecording();
    onRecordingComplete?.(chunks, recording.mimeType, recording.duration);
  }, [recording, onRecordingComplete]);

  // ── Audio level ─────────────────────────────────────────
  const { level } = useAudioLevel(
    recording.analyserNode,
    recording.isRecording,
  );

  // ── Tab visibility warning (mobile) ─────────────────────
  const showTabWarning =
    typeof document !== "undefined" &&
    recording.isRecording &&
    /Mobi|Android/i.test(navigator?.userAgent ?? "");

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-6",
        "rounded-2xl border border-slate-700/60 bg-slate-900",
        "px-6 py-8 shadow-xl shadow-black/40",
        "w-full max-w-md mx-auto",
        className,
      )}
    >
      {/* ── Session badge ─────────────────────────────────── */}
      {sessionId && (
        <div className="self-stretch flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <FileAudio className="size-3.5" />
            Consultation Recording
          </span>
          <span className="font-mono text-xs text-slate-600 truncate max-w-[120px]">
            {sessionId.slice(0, 8)}…
          </span>
        </div>
      )}

      {/* ── Audio visualiser ─────────────────────────────── */}
      <div className="relative w-full flex justify-center py-2">
        <AudioLevelMeter
          level={level}
          isActive={recording.isRecording}
          className="w-full"
        />

        {/* Idle placeholder bars (always shown, just flat) */}
        {!recording.isRecording && !recording.isPaused && (
          <div
            aria-hidden
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="text-xs text-slate-600 tracking-wide">
              Tap Start to begin
            </span>
          </div>
        )}
      </div>

      {/* ── Timer ───────────────────────────────────────────── */}
      <RecordingTimer
        formattedDuration={recording.formattedDuration}
        isRecording={recording.isRecording}
        isPaused={recording.isPaused}
        isNearLimit={recording.isNearLimit}
      />

      {/* ── Permission / error prompt ───────────────────────── */}
      {recording.hasError && (
        <PermissionPrompt
          error={recording.error}
          onRetry={recording.clearError}
          className="self-stretch"
        />
      )}

      {/* ── Main record controls ────────────────────────────── */}
      <RecordButton
        recordingState={recording.recordingState}
        onStart={handleStart}
        onPause={recording.pauseRecording}
        onResume={recording.resumeRecording}
        onStop={handleStop}
        pauseSupported={recording.pauseSupported}
        disabled={disabled}
      />

      {/* ── Device selector ─────────────────────────────────── */}
      <DeviceSelector
        devices={devices}
        selectedDeviceId={selectedDeviceId}
        onChange={setSelectedDeviceId}
        disabled={disabled || recording.isRecording || recording.isPaused}
        isLoading={devicesLoading}
        onRefresh={refreshDevices}
        className="self-stretch"
      />

      {/* ── Chunk / size info ───────────────────────────────── */}
      {(recording.isRecording || recording.isPaused || recording.isStopped) && (
        <div className="self-stretch flex items-center justify-between text-xs text-slate-500">
          <span>
            {recording.chunkCount} chunk{recording.chunkCount !== 1 ? "s" : ""} captured
          </span>
          <span>{formatBytes(recording.totalSize)}</span>
        </div>
      )}

      {/* ── Mobile tab-hidden warning ───────────────────────── */}
      {showTabWarning && (
        <div
          role="status"
          className="self-stretch flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2"
        >
          <Info className="size-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-300">
            Keep this tab open while recording. Switching apps may stop the microphone on some devices.
          </p>
        </div>
      )}

      {/* ── Format info ──────────────────────────────────────── */}
      {recording.mimeType && (
        <p className="text-[10px] text-slate-600">
          Format: {recording.mimeType.split(";")[0]}
        </p>
      )}
    </div>
  );
}
