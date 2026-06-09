"use client";

import { Loader2 } from "lucide-react";
import { PatientContextHeader } from "./PatientContextHeader.jsx";
import { ClinicalTimeline } from "./ClinicalTimeline.jsx";

/**
 * Lightweight shell while audio is uploading or transcribing.
 * Avoids mounting the full clinical workspace until the transcript API is ready.
 */
export function TranscriptionPendingView({
  patient,
  sessionDate,
  status,
  message,
  toolbarLeft,
  onOpenSessions,
  onEndSession,
  pipelineLabel,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f8fafc]" data-testid="consultation-workspace">
      <PatientContextHeader
        patient={patient}
        sessionDate={sessionDate}
        status={status}
        toolbarLeft={toolbarLeft}
        onOpenSessions={onOpenSessions}
        onEndSession={onEndSession}
        pipelineLabel={pipelineLabel}
      />
      <ClinicalTimeline status={status} />
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-12"
        data-testid="transcript-review-workspace"
      >
        <Loader2 className="h-10 w-10 animate-spin text-teal-500" aria-hidden />
        <div className="max-w-md text-center">
          <p className="text-base font-medium text-slate-800">{message}</p>
          <p className="mt-2 text-sm text-slate-500">
            Your consultation will open automatically when transcription completes.
          </p>
        </div>
      </div>
    </div>
  );
}
