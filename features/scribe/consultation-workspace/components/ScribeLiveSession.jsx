"use client";

import { useCallback } from "react";
import { useRecording } from "@/features/scribe/recording/use-recording.js";
import { ScribeShell, ScribeColumns } from "./ScribeShell.jsx";
import { ScribeSessionHeader } from "./ScribeSessionHeader.jsx";
import { TranscriptPanel } from "./TranscriptPanel.jsx";
import { SOAPEmptyPanel } from "./SOAPPanel.jsx";

export function ScribeLiveSession({
  disabled,
  pipelineMessage,
  onRecordingComplete,
  onError,
  onEndSession,
  onOpenSessions,
  toolbarLeft,
}) {
  const recording = useRecording({
    chunkIntervalMs: 5_000,
    onError: (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  });

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
    <ScribeShell
      header={
        <ScribeSessionHeader
          toolbarLeft={toolbarLeft}
          onEndSession={onEndSession}
          onOpenSessions={onOpenSessions}
        />
      }
    >
      <ScribeColumns
        recording={
          <TranscriptPanel
            segments={[]}
            dirty={{}}
            mode="recording"
            isRecording={isRecording}
            isPaused={recording.isPaused}
            duration={recording.duration}
            pipelineMessage={pipelineMessage}
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
        }
        soap={<SOAPEmptyPanel generating={Boolean(pipelineMessage)} />}
      />
    </ScribeShell>
  );
}
