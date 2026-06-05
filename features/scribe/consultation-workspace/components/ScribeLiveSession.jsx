"use client";

import { useCallback } from "react";
import { useUser } from "@/hooks/use-user";
import { useRecording } from "@/features/scribe/recording/use-recording.js";
import { useAudioLevel } from "@/features/scribe/recording/use-audio-level.js";
import { ScribeSessionHeader, ScribeSessionFooter } from "./ScribeSessionHeader.jsx";
import { PatientSidebar } from "./PatientSidebar.jsx";
import { TranscriptPanel } from "./TranscriptPanel.jsx";
import { SOAPEmptyPanel } from "./SOAPPanel.jsx";

export function ScribeLiveSession({
  language,
  disabled,
  pipelineMessage,
  onRecordingComplete,
  onError,
  onEndSession,
}) {
  const { displayName, specialization } = useUser();

  const recording = useRecording({
    chunkIntervalMs: 5_000,
    onError: (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  });

  const { level: audioLevel } = useAudioLevel(
    recording.analyserNode,
    recording.isRecording && !recording.isPaused,
  );

  const handleStop = useCallback(async () => {
    try {
      const chunks = await recording.stopRecording();
      if (!chunks?.length) {
        onError?.(new Error("No audio captured. Record for a few seconds, then stop."));
        return;
      }
      await onRecordingComplete(chunks, recording.mimeType, recording.duration);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, [onError, onRecordingComplete, recording]);

  const isRecording = recording.isRecording || recording.isPaused;

  return (
    <div
      className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-sm"
      data-testid="scribe-live-session"
    >
      <ScribeSessionHeader
        isRecording={isRecording}
        isPaused={recording.isPaused}
        duration={recording.duration}
        audioLevel={audioLevel}
        doctorName={displayName}
        doctorSpecialty={specialization}
        onEndSession={onEndSession}
      />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <PatientSidebar sessionDate={new Date().toISOString()} />

        <TranscriptPanel
          segments={[]}
          dirty={{}}
          mode="recording"
          isRecording={isRecording}
          isPaused={recording.isPaused}
          duration={recording.duration}
          pipelineMessage={pipelineMessage}
          language={language}
          recordingControls={
            isRecording
              ? {
                  disabled: disabled || recording.isRequesting,
                  onPauseResume: recording.isPaused
                    ? recording.resumeRecording
                    : recording.pauseRecording,
                  onStop: handleStop,
                }
              : null
          }
          onStartRecording={!isRecording && !disabled ? recording.startRecording : undefined}
          isRequestingMic={recording.isRequesting}
        />

        <SOAPEmptyPanel sessionStatus="RECORDING" generating={Boolean(pipelineMessage)} canGenerate={false} />
      </div>

      <ScribeSessionFooter statusLabel="Recording" />
    </div>
  );
}
