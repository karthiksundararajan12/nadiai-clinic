"use client";

/**
 * Production recording panel: useRecording + ScribeRecorder (mic-first UI).
 */

import { useCallback } from "react";
import { ScribeRecorder } from "@/components/scribe/scribe-recorder";
import { useRecording } from "@/features/scribe/recording/use-recording.js";

/**
 * @param {{
 *   disabled?: boolean;
 *   onRecordingComplete: (chunks: Blob[], mimeType: string, durationSeconds: number) => void | Promise<void>;
 *   onError?: (err: Error) => void;
 * }} props
 */
export function ScribeRecordingPanel({ disabled, onRecordingComplete, onError }) {
  const recording = useRecording({
    onError: (err) => onError?.(err instanceof Error ? err : new Error(String(err))),
  });

  const handleStop = useCallback(async () => {
    const chunks = await recording.stopRecording();
    if (chunks?.length) {
      await onRecordingComplete(chunks, recording.mimeType, recording.duration);
    }
  }, [recording, onRecordingComplete]);

  const isRecording = recording.isRecording || recording.isPaused;

  return (
    <div className="w-full flex flex-col items-center">
      {recording.isRequesting ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="h-9 w-9 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <p className="text-sm text-muted-foreground">Allow microphone access…</p>
        </div>
      ) : (
        <ScribeRecorder
          disabled={disabled}
          isRecording={isRecording}
          isPaused={recording.isPaused}
          duration={recording.duration}
          onStart={recording.startRecording}
          onPause={recording.pauseRecording}
          onResume={recording.resumeRecording}
          onStop={handleStop}
        />
      )}
    </div>
  );
}
