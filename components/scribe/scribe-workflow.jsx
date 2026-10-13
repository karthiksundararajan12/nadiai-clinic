"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClockCounterClockwise } from "@phosphor-icons/react";
import { scribePageFont } from "@/components/scribe/scribe-font";
import { cn } from "@/lib/utils";
import { Header, HeaderToolbarButton } from "@/components/layout/header";
import { LanguageToggle } from "@/components/scribe/language-toggle";
import { Toast } from "@/components/ui/toast";
import { uploadCompletedRecording } from "@/features/scribe/upload/audio-upload.client.js";
import { completeLiveTranscription } from "@/features/scribe/upload/live-transcription.client.js";
import { submitManualTranscript } from "@/features/scribe/upload/manual-transcript.client.js";
import { useRecording } from "@/features/scribe/recording/use-recording.js";
import { useLiveTranscription } from "@/features/scribe/recording/use-live-transcription.js";
import { useAudioLevel } from "@/features/scribe/recording/use-audio-level.js";
import { RECORDING_LIMITS } from "@/features/scribe/recording/constants.js";
import { ConsultationWorkspace } from "@/features/scribe/consultation-workspace";
import { SessionsDrawer } from "@/features/scribe/consultation-workspace/components/SessionsDrawer.jsx";
import { ScribeRecordPanel } from "@/features/scribe/consultation-workspace/components/consultation/ScribeRecordPanel.jsx";
import { ScribeWorkflowStepper } from "@/features/scribe/consultation-workspace/components/consultation/ScribeWorkflowStepper.jsx";
import { LiveTranscriptPanel } from "@/features/scribe/consultation-workspace/components/consultation/LiveTranscriptPanel.jsx";
import { ScribeSoapPlaceholder } from "@/features/scribe/consultation-workspace/components/consultation/ScribeSoapPlaceholder.jsx";
import { PatientSelector } from "@/features/scribe/consultation-workspace/components/consultation/PatientSelector.jsx";
import { appointmentToPatientPrefill } from "@/features/appointments/appointment-prefill.js";
import { fetchAppointmentById } from "@/features/appointments/appointments.client.js";
import { Button } from "@/components/ui/button";
import { ACTIVE_CONSULTATION_STATUSES } from "@/features/scribe/client";
import { logSessionEvent } from "@/features/scribe/consultation-workspace/services/scribe-export.client.js";
import { useDoctorProfileSettings } from "@/hooks/use-doctor-profile-settings";
import { SCRIBE_LANGUAGE } from "@/features/scribe/constants.js";
import { setRecordingGuardActive } from "@/features/scribe/recording/recording-guard.js";
import {
  RECORD_PANEL_CONTEXT,
  resolveRecordPanelContext,
} from "@/features/scribe/consultation-workspace/lib/record-panel-session-context.js";
import { hasDistinctClinicalSpeakers } from "@/features/scribe/lib/speaker-diarization.js";
import { resolveScribeWorkflowStepIndex } from "@/features/scribe/consultation-workspace/lib/scribe-workflow-step.js";
import { resolveDisplayTranscriptSegments } from "@/features/scribe/consultation-workspace/lib/conversation-chat-view.js";
import { logScribeTiming } from "@/features/scribe/consultation-workspace/lib/scribe-client-log.js";
import {
  BATCH_DIARIZATION_TIMEOUT_MS,
  TRANSCRIPTION_BUDGET_MS,
  createPipelineTimer,
} from "@/features/scribe/lib/transcription-budget.js";

const TRANSCRIBE_TIMEOUT_MS = TRANSCRIPTION_BUDGET_MS;

const TRANSCRIBED_STATUSES = new Set([
  "TRANSCRIBED",
  "REVIEWING",
  "REVIEW_COMPLETED",
  "GENERATING_SOAP",
  "SOAP_READY",
  "SOAP_REVIEW_REQUIRED",
  "SOAP_REVIEWING",
]);

async function runTranscriptionPipeline(sessionId, signal, body = {}) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}/transcription/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(payload?.error || `Transcription failed (${res.status})`);
  }
  return payload;
}

async function fetchConsultations(bucket) {
  const res = await fetch(
    `/api/scribe/consultations/history?bucket=${bucket}&limit=50&sort_order=desc`,
  );
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `Failed to load consultations (${res.status})`);
  return payload?.data ?? [];
}

export function ScribeWorkflow() {
  const { preferences, loading: profileSettingsLoading } = useDoctorProfileSettings();
  const [language, setLanguage] = useState(SCRIBE_LANGUAGE.ENGLISH);
  const [languageInitialized, setLanguageInitialized] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [viewFromHistory, setViewFromHistory] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [appointmentId, setAppointmentId] = useState(null);
  const [appointmentPrefillLoading, setAppointmentPrefillLoading] = useState(false);
  const [appointmentPrefillError, setAppointmentPrefillError] = useState(null);

  const [activeSessions, setActiveSessions] = useState([]);
  const [historySessions, setHistorySessions] = useState([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(null);

  const [pipelineBusy, setPipelineBusy] = useState(false);
  const [pipelineMessage, setPipelineMessage] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [manualInputMode, setManualInputMode] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [busySessionId, setBusySessionId] = useState(null);
  const [deletingSessionId, setDeletingSessionId] = useState(null);
  const [toastVariant, setToastVariant] = useState("warning");
  const [lastRecordedSessionId, setLastRecordedSessionId] = useState(null);
  const [workspaceState, setWorkspaceState] = useState({
    segments: [],
    transcriptLoading: false,
    transcriptLoadingMessage: null,
    sessionComplete: false,
    highlightedSegmentId: null,
  });
  const [optimisticSegments, setOptimisticSegments] = useState([]);
  const [transcriptRefreshNonce, setTranscriptRefreshNonce] = useState(0);
  const pipelineTimerRef = useRef(null);

  const mountedRef = useRef(true);
  const appointmentPrefillAttemptedRef = useRef(false);
  const soapTurnSelectionRef = useRef({
    deleted_segment_ids: [],
    segment_inclusion: {},
  });
  const getSoapTurnSelection = useCallback(() => soapTurnSelectionRef.current, []);
  const handleSoapTurnSelectionChange = useCallback((next) => {
    soapTurnSelectionRef.current = {
      deleted_segment_ids: next?.deleted_segment_ids ?? [],
      segment_inclusion: next?.segment_inclusion ?? {},
    };
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!profileSettingsLoading && preferences && !languageInitialized) {
      setLanguage(preferences.defaultScribeLanguage ?? SCRIBE_LANGUAGE.ENGLISH);
      setLanguageInitialized(true);
    }
  }, [preferences, profileSettingsLoading, languageInitialized]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("appointment_id");
    if (!id || appointmentPrefillAttemptedRef.current) return;

    appointmentPrefillAttemptedRef.current = true;
    setAppointmentId(id);
    setAppointmentPrefillLoading(true);
    setAppointmentPrefillError(null);

    void fetchAppointmentById(id)
      .then((appointment) => {
        if (!mountedRef.current) return;
        setSelectedPatient(appointmentToPatientPrefill(appointment));
        setAppointmentId(appointment?.id ?? id);
      })
      .catch((err) => {
        if (!mountedRef.current) return;
        setAppointmentPrefillError(
          err instanceof Error ? err : new Error(String(err)),
        );
      })
      .finally(() => {
        if (mountedRef.current) setAppointmentPrefillLoading(false);
      });
  }, []);

  const live = useLiveTranscription({ language });

  const recording = useRecording({
    chunkIntervalMs: RECORDING_LIMITS.LIVE_CHUNK_INTERVAL_MS,
    onChunkReady: (blob) => {
      void live.sendAudio(blob);
    },
    onError: (err) => setUploadError(err instanceof Error ? err : new Error(String(err))),
  });

  const isRecordingLive = recording.isRecording || recording.isPaused;
  const { level: audioLevel } = useAudioLevel(recording.analyserNode, isRecordingLive);

  useEffect(() => {
    setRecordingGuardActive(isRecordingLive);
    return () => setRecordingGuardActive(false);
  }, [isRecordingLive]);

  useEffect(() => {
    if (recording.isRecording && live.status === "idle") {
      live.connect(recording.mimeType);
    }
  }, [recording.isRecording, recording.mimeType, live]);
  const audioStatsRef = useRef({ sum: 0, count: 0, peak: 0 });

  useEffect(() => {
    if (recording.isRequesting) {
      audioStatsRef.current = { sum: 0, count: 0, peak: 0 };
    }
  }, [recording.isRequesting]);

  useEffect(() => {
    if (!recording.isRecording) return;
    audioStatsRef.current.sum += audioLevel;
    audioStatsRef.current.count += 1;
    audioStatsRef.current.peak = Math.max(audioStatsRef.current.peak, audioLevel);
  }, [audioLevel, recording.isRecording]);

  const loadConsultations = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setInitialLoad(true);
    setListError(null);

    try {
      const [active, history] = await Promise.all([
        fetchConsultations("active"),
        fetchConsultations("history"),
      ]);
      if (mountedRef.current) {
        setActiveSessions(active);
        setHistorySessions(history);
      }
    } catch (err) {
      if (mountedRef.current) setListError(err);
    } finally {
      if (mountedRef.current) {
        setInitialLoad(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadConsultations(false);
  }, [loadConsultations]);

  useEffect(() => {
    if (sessionsOpen) void loadConsultations(true);
  }, [sessionsOpen, loadConsultations]);

  const refineSpeakersInBackground = useCallback(async (sessionId) => {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BATCH_DIARIZATION_TIMEOUT_MS);
    logScribeTiming("batch Deepgram start", {
      sessionId,
      mode: "refine",
      timeoutMs: BATCH_DIARIZATION_TIMEOUT_MS,
    });
    try {
      const payload = await runTranscriptionPipeline(
        sessionId,
        controller.signal,
        { refineSpeakers: true },
      );
      const refined = payload?.segments ?? payload?.result?.segments ?? [];
      const skipped = payload?.result?.status === "refine_skipped";
      logScribeTiming("batch Deepgram end", {
        sessionId,
        mode: "refine",
        durationMs: Date.now() - startedAt,
        segmentCount: Array.isArray(refined) ? refined.length : 0,
        status: payload?.result?.status ?? payload?.session?.status,
        skipped,
      });
      if (!skipped && Array.isArray(refined) && refined.length) {
        setOptimisticSegments(refined);
        setTranscriptRefreshNonce((n) => n + 1);
      }
    } catch (err) {
      logScribeTiming("batch Deepgram end", {
        sessionId,
        mode: "refine",
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
        keptLiveTranscript: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  const runTranscription = useCallback(async (sessionId) => {
    setPipelineBusy(true);
    setPipelineMessage("Transcribing…");
    setBusySessionId(sessionId);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
    const startedAt = Date.now();
    logScribeTiming("batch Deepgram start", { sessionId, mode: "transcribe" });

    try {
      const payload = await runTranscriptionPipeline(sessionId, controller.signal);
      const batchSegments = payload?.segments ?? payload?.result?.segments ?? [];
      if (Array.isArray(batchSegments) && batchSegments.length) {
        setOptimisticSegments(batchSegments);
        setTranscriptRefreshNonce((n) => n + 1);
      }
      logScribeTiming("batch Deepgram end", {
        sessionId,
        mode: "transcribe",
        durationMs: Date.now() - startedAt,
        status: payload?.session?.status ?? payload?.status,
        segmentCount: Array.isArray(batchSegments) ? batchSegments.length : 0,
      });
      pipelineTimerRef.current?.mark("transcript saved", {
        sessionId,
        source: "batch",
        durationMs: Date.now() - startedAt,
      });
      logScribeTiming("transcript saved", {
        sessionId,
        source: "batch",
        durationMs: Date.now() - startedAt,
      });
      await loadConsultations(true);
      const status = payload?.session?.status ?? payload?.status;
      if (TRANSCRIBED_STATUSES.has(status)) {
        setViewFromHistory(false);
        setActiveSessionId(sessionId);
        setSessionsOpen(false);
      }
      return payload;
    } catch (err) {
      logScribeTiming("batch Deepgram end", {
        sessionId,
        mode: "transcribe",
        durationMs: Date.now() - startedAt,
        error: err instanceof Error ? err.message : String(err),
      });
      const message =
        err instanceof Error && err.name === "AbortError"
          ? "Transcription timed out. Open Sessions and tap Transcribe to retry."
          : err instanceof Error
            ? err.message
            : "Transcription failed";
      const wrapped = new Error(message);
      setListError(wrapped);
      setUploadError(wrapped);
    } finally {
      clearTimeout(timeout);
      setBusySessionId(null);
      if (mountedRef.current) {
        setPipelineBusy(false);
        setPipelineMessage(null);
      }
    }
  }, [loadConsultations]);

  const handleRecordingComplete = useCallback(async (chunks, mimeType, durationSeconds, liveResult) => {
    if (!chunks?.length) {
      setUploadError(new Error("No audio captured. Allow microphone access and try again."));
      return;
    }

    setUploadError(null);
    setPipelineBusy(true);
    setPipelineMessage("Uploading audio…");

    const timer = pipelineTimerRef.current;
    const audioSizeBytes = chunks.reduce((sum, chunk) => sum + (chunk?.size ?? 0), 0);
    const audioDurationSeconds = Math.max(1, durationSeconds || 30);
    timer?.mark("upload start", {
      audioSizeBytes,
      durationSeconds: audioDurationSeconds,
      mimeType,
    });
    logScribeTiming("upload start", {
      audioSizeBytes,
      durationSeconds: audioDurationSeconds,
      mimeType,
    });

    try {
      const finalized = await uploadCompletedRecording({
        chunks,
        audioDurationSeconds,
        language,
        patientId: selectedPatient?.id,
        appointmentId,
        maxRetries: 1,
        onProgress: (event) => {
          if (event.phase === "uploading") {
            setPipelineMessage(`Uploading… ${event.progress ?? 0}%`);
          } else if (event.phase === "finalizing") {
            setPipelineMessage("Finalizing upload…");
          }
        },
      });
      timer?.mark("upload end", {
        sessionId: finalized?.session?.id ?? finalized?.id,
        audioSizeBytes,
        durationSeconds: audioDurationSeconds,
      });
      logScribeTiming("upload end", timer?.getMarks().at(-1) ?? { audioSizeBytes });

      const sessionId = finalized?.session?.id ?? finalized?.id;
      if (!sessionId) throw new Error("Upload finished but no session id was returned");

      setLastRecordedSessionId(sessionId);
      setActiveSessionId(sessionId);
      setViewFromHistory(false);

      void logSessionEvent(sessionId, "recording_started", {}).catch(() => {});
      void logSessionEvent(sessionId, "recording_stopped", {
        duration_seconds: audioDurationSeconds,
      }).catch(() => {});

      const liveSegments = (liveResult?.segments ?? []).filter(
        (seg) => !seg.is_interim && String(seg.text ?? "").trim(),
      );
      const hasLiveText = Boolean(liveResult?.text && liveSegments.length);
      const distinctSpeakers = hasDistinctClinicalSpeakers(liveSegments);
      logScribeTiming("hasDistinctClinicalSpeakers", {
        sessionId,
        result: distinctSpeakers,
        segmentCount: liveSegments.length,
        transcriptChars: String(liveResult?.text ?? "").length,
      });

      // Show live text immediately. Batch (v2) diarization runs in the
      // background when the live v1 stream collapsed to one speaker — do not
      // block the Conversation panel or SOAP on it.
      if (hasLiveText) {
        setOptimisticSegments(liveSegments);
        timer?.mark("UI shown", {
          sessionId,
          transcriptLength: liveSegments.length,
          source: "live",
        });
        logScribeTiming("UI shown", timer?.getMarks().at(-1) ?? { source: "live" });
        setPipelineMessage("Saving transcript…");
        try {
          const saveStartedAt = Date.now();
          await completeLiveTranscription(sessionId, liveResult);
          timer?.mark("transcript saved", {
            sessionId,
            durationMs: Date.now() - saveStartedAt,
            segmentCount: liveSegments.length,
          });
          logScribeTiming("transcript saved", timer?.getMarks().at(-1) ?? { sessionId });
          try {
            timer?.assertBudget();
          } catch (budgetErr) {
            logScribeTiming("transcription budget exceeded", {
              sessionId,
              error: budgetErr instanceof Error ? budgetErr.message : String(budgetErr),
              marks: timer?.getMarks(),
            });
          }
          await loadConsultations(true);
          setViewFromHistory(false);
          setActiveSessionId(sessionId);
          setSessionsOpen(false);
          setPipelineBusy(false);
          setPipelineMessage(null);
          if (!distinctSpeakers) {
            void refineSpeakersInBackground(sessionId);
          }
          return;
        } catch (liveErr) {
          setPipelineMessage("Live transcript save failed — transcribing recording…");
        }
      } else {
        setPipelineMessage("Transcribing…");
      }

      void runTranscription(sessionId);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (err && typeof err === "object" && "code" in err) wrapped.code = err.code;
      setUploadError(wrapped);
      setActiveSessionId(null);
      setPipelineBusy(false);
      setPipelineMessage(null);
    }
  }, [appointmentId, language, loadConsultations, refineSpeakersInBackground, runTranscription, selectedPatient?.id]);

  const handleStopRecording = useCallback(async () => {
    try {
      const duration = recording.duration;
      const stats = audioStatsRef.current;
      const avgLevel = stats.count > 0 ? stats.sum / stats.count : 0;
      const tooShort = duration < RECORDING_LIMITS.MIN_DURATION_SECONDS;
      const unclear =
        stats.peak < RECORDING_LIMITS.MIN_PEAK_AUDIO_LEVEL ||
        avgLevel < RECORDING_LIMITS.MIN_AVG_AUDIO_LEVEL;

      if (tooShort && unclear) {
        setToastVariant("warning");
        setToastMessage(
          "Recording is too short and audio is not clear. Speak louder and record for at least 10 seconds.",
        );
        await recording.stopRecording();
        recording.resetRecording();
        live.reset();
        return;
      }
      if (tooShort) {
        setToastVariant("warning");
        setToastMessage("Recording is too short. Please record for at least 10 seconds.");
        await recording.stopRecording();
        recording.resetRecording();
        live.reset();
        return;
      }
      if (unclear) {
        setToastVariant("warning");
        setToastMessage("Audio is not clear. Please speak louder and try again.");
        await recording.stopRecording();
        recording.resetRecording();
        live.reset();
        return;
      }

      const timer = createPipelineTimer();
      pipelineTimerRef.current = timer;
      const chunks = await recording.stopRecording();
      const audioSizeBytes = (chunks ?? []).reduce((sum, chunk) => sum + (chunk?.size ?? 0), 0);
      timer.mark("recorder stop", {
        durationSeconds: duration,
        audioSizeBytes,
        mimeType: recording.mimeType,
        chunkCount: chunks?.length ?? 0,
      });
      logScribeTiming("recorder stop", timer.getMarks().at(-1));
      const liveResult = await live.finish();
      await handleRecordingComplete(chunks, recording.mimeType, duration, liveResult);
    } catch (err) {
      setUploadError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [handleRecordingComplete, live, recording]);

  const recordState = useMemo(() => {
    if (pipelineBusy) return "processing";
    if (recording.isRequesting) return "requesting";
    if (recording.isPaused) return "paused";
    if (recording.isRecording) return "recording";
    return "idle";
  }, [
    pipelineBusy,
    recording.isRequesting,
    recording.isPaused,
    recording.isRecording,
  ]);

  const recordPanelSessionContext = useMemo(
    () =>
      resolveRecordPanelContext({
        hasOpenSession: Boolean(activeSessionId),
        viewFromHistory,
        sessionComplete: workspaceState.sessionComplete,
        sessionStatus: workspaceState.status,
      }),
    [
      activeSessionId,
      viewFromHistory,
      workspaceState.sessionComplete,
      workspaceState.status,
    ],
  );

  const displayTranscriptSegments = useMemo(
    () =>
      resolveDisplayTranscriptSegments({
        workspaceSegments: workspaceState.segments,
        optimisticSegments,
        liveSegments: live.segments,
      }),
    [workspaceState.segments, optimisticSegments, live.segments],
  );

  useEffect(() => {
    const timer = pipelineTimerRef.current;
    if (!timer || !displayTranscriptSegments.length) return;
    if (timer.getMarks().some((mark) => mark.name === "UI shown")) return;
    timer.mark("UI shown", {
      transcriptLength: displayTranscriptSegments.length,
      source: "display",
    });
    logScribeTiming("UI shown", timer.getMarks().at(-1));
    try {
      timer.assertBudget();
    } catch (budgetErr) {
      logScribeTiming("transcription budget exceeded", {
        error: budgetErr instanceof Error ? budgetErr.message : String(budgetErr),
        marks: timer.getMarks(),
      });
    }
  }, [displayTranscriptSegments.length]);

  const goLive = useCallback(() => {
    setActiveSessionId(null);
    setViewFromHistory(false);
    setUploadError(null);
    setManualInputMode(false);
    setManualSubmitting(false);
    setSessionsOpen(false);
    setAppointmentPrefillError(null);
    soapTurnSelectionRef.current = {
      deleted_segment_ids: [],
      segment_inclusion: {},
    };
    setOptimisticSegments([]);
    setTranscriptRefreshNonce(0);
    pipelineTimerRef.current = null;
    setWorkspaceState({
      segments: [],
      transcriptLoading: false,
      transcriptLoadingMessage: null,
      sessionComplete: false,
      highlightedSegmentId: null,
      patient: null,
      audioDurationSeconds: null,
      canApproveSOAP: false,
      canEditNote: false,
      approving: false,
      clinicalById: {},
    });
    recording.resetRecording?.();
    live.reset();
  }, [live, recording.resetRecording]);

  const handleNewSession = useCallback(() => {
    const unfinished =
      recordPanelSessionContext === RECORD_PANEL_CONTEXT.IN_PROGRESS;
    if (
      unfinished &&
      !window.confirm(
        "This SOAP note isn't approved yet. Start a new session anyway? You can finish this consultation later from Past sessions.",
      )
    ) {
      return;
    }
    goLive();
  }, [goLive, recordPanelSessionContext]);

  const handleManualTranscriptSubmit = useCallback(async (text) => {
    setUploadError(null);
    setManualSubmitting(true);
    setPipelineMessage("Saving transcript…");

    try {
      const result = await submitManualTranscript({
        text,
        language,
        patientId: selectedPatient?.id,
        appointmentId,
      });

      const sessionId = result?.session?.id;
      if (!sessionId) throw new Error("Transcript saved but no session id was returned");

      setLastRecordedSessionId(sessionId);
      setActiveSessionId(sessionId);
      setViewFromHistory(false);
      setManualInputMode(false);
      setPipelineMessage(null);
      await loadConsultations(true);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      if (err && typeof err === "object" && "code" in err) wrapped.code = err.code;
      setUploadError(wrapped);
      setPipelineMessage(null);
    } finally {
      setManualSubmitting(false);
    }
  }, [appointmentId, language, loadConsultations, selectedPatient?.id]);

  const openSession = useCallback((sessionId, fromHistory = false) => {
    setViewFromHistory(fromHistory);
    setActiveSessionId(sessionId);
    setSessionsOpen(false);
  }, []);

  const deleteSession = useCallback(async (sessionId) => {
    if (deletingSessionId === sessionId) return;
    if (!window.confirm("Delete this recording? This cannot be undone.")) return;

    setDeletingSessionId(sessionId);
    setListError(null);
    try {
      const res = await fetch(`/api/scribe/sessions/${sessionId}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.error || `Delete failed (${res.status})`);

      setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setHistorySessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (activeSessionId === sessionId) goLive();
      else await loadConsultations(true);
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setListError(wrapped);
      setToastMessage(wrapped.message);
      setToastVariant("error");
    } finally {
      setDeletingSessionId(null);
    }
  }, [activeSessionId, deletingSessionId, goLive, loadConsultations]);

  const handleSOAPApproved = useCallback((result, options = {}) => {
    const approvedId = result?.session?.id ?? activeSessionId;
    const approvedSession = result?.session;

    if (approvedId && !options.keepSessionOpen) {
      setActiveSessions((prev) => prev.filter((s) => s.id !== approvedId));
      if (approvedSession) {
        const row = {
          ...approvedSession,
          approval_status: "approved",
          soap_status: "approved",
        };
        setHistorySessions((prev) => [
          row,
          ...prev.filter((s) => s.id !== approvedId),
        ]);
      }
    }

    if (!options.keepSessionOpen && !options.prescriptionApproved) {
      goLive();
    }
    void loadConsultations(true);
  }, [activeSessionId, goLive, loadConsultations]);

  const handleTranscriptionComplete = useCallback(() => {
    setPipelineBusy(false);
    setPipelineMessage(null);
  }, []);

  const languageToggle = (
    <LanguageToggle
      value={language}
      onChange={setLanguage}
      disabled={isRecordingLive}
      variant="segmented"
    />
  );

  const sessionsDrawer = (
    <SessionsDrawer
      open={sessionsOpen}
      onClose={() => setSessionsOpen(false)}
      activeSessions={activeSessions}
      historySessions={historySessions}
      loading={initialLoad}
      refreshing={refreshing}
      error={listError}
      busySessionId={busySessionId}
      deletingSessionId={deletingSessionId}
      lastRecordedSessionId={lastRecordedSessionId}
      onRefresh={() => loadConsultations(true)}
      onOpen={openSession}
      onTranscribe={runTranscription}
      onDelete={deleteSession}
      canDelete={(status) => ACTIVE_CONSULTATION_STATUSES.includes(status)}
    />
  );

  const rightPanel = activeSessionId ? (
    <ConsultationWorkspace
      key={activeSessionId}
      sessionId={activeSessionId}
      onApproved={handleSOAPApproved}
      onEndSession={goLive}
      onOpenSessions={() => setSessionsOpen(true)}
      readOnly={viewFromHistory}
      pipelineBusy={pipelineBusy}
      pipelineMessage={pipelineMessage}
      onTranscriptionComplete={handleTranscriptionComplete}
      onStartTranscription={runTranscription}
      autoGenerateNote={!viewFromHistory}
      onDelete={() => deleteSession(activeSessionId)}
      deleting={deletingSessionId === activeSessionId}
      selectedPatient={selectedPatient}
      onSelectedPatientChange={(next) => {
        setSelectedPatient(next);
        if (next?.appointment_id !== undefined) {
          setAppointmentId(next.appointment_id ?? null);
        }
      }}
      onWorkspaceStateChange={setWorkspaceState}
      getSoapTurnSelection={getSoapTurnSelection}
      transcriptRefreshNonce={transcriptRefreshNonce}
    />
  ) : (
    <ScribeSoapPlaceholder
      processing={pipelineBusy}
      message={pipelineMessage ?? "Processing…"}
      recordState={recordState}
      patientSelected={Boolean(selectedPatient)}
    />
  );

  const recorderStatus = (isRecordingLive || recording.micState !== "inactive") ? (
    <LiveTranscriptPanel
      liveStatus={live.status}
      fallback={live.fallback}
      micState={recording.micState}
    />
  ) : null;

  return (
    <div
      className={cn(
        "relative flex h-dvh max-h-dvh min-h-dvh w-full min-w-0 flex-col overflow-hidden",
        "min-[1920px]:text-lg",
        scribePageFont.variable,
      )}
      data-testid="scribe-workflow"
    >
      <div
        className={cn(
          "mx-auto flex h-full min-h-0 w-full min-w-0 max-w-full flex-1 flex-col overflow-visible lg:overflow-hidden",
          "sm:max-w-2xl lg:max-w-none xl:max-w-7xl min-[1920px]:max-w-[1600px]",
        )}
      >
      <Header
        title="AI Scribe"
        subtitle="Record the consultation, review the SOAP note"
        showClock={false}
        actions={
          <HeaderToolbarButton
            className="h-11 min-h-11 !w-auto min-w-11 shrink-0 gap-2 px-3 min-[1920px]:h-12 min-[1920px]:min-h-12 min-[1920px]:px-4 min-[1920px]:text-lg"
            aria-label="Past sessions"
            onClick={() => setSessionsOpen(true)}
          >
            <ClockCounterClockwise size={20} weight="bold" className="shrink-0 text-primary" />
            <span className="hidden sm:inline">Past sessions</span>
          </HeaderToolbarButton>
        }
      />
      {appointmentPrefillLoading && (
        <p className="break-words border-b border-[color:var(--scribe-card-border)] bg-amber-50 px-4 py-2 text-base font-medium text-amber-900 sm:px-6 min-[1920px]:px-8 min-[1920px]:text-lg">
          Loading appointment details…
        </p>
      )}
      {appointmentPrefillError && (
        <p className="break-words border-b border-[color:var(--scribe-card-border)] bg-destructive/5 px-4 py-2 text-base font-medium text-destructive sm:px-6 min-[1920px]:px-8 min-[1920px]:text-lg">
          {appointmentPrefillError.message}
        </p>
      )}
      <div
        className={cn(
          "flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-visible px-4 py-4 lg:overflow-hidden",
          "md:gap-5 lg:gap-6 lg:px-6 lg:py-6",
          "min-[1920px]:gap-8 min-[1920px]:px-8 min-[1920px]:py-8",
          !manualInputMode &&
            (isRecordingLive
              ? "max-lg:pb-[calc(15rem+env(safe-area-inset-bottom))]"
              : activeSessionId
                ? "max-lg:pb-[calc(13rem+env(safe-area-inset-bottom))]"
                : "max-lg:pb-[calc(10rem+env(safe-area-inset-bottom))]"),
        )}
      >
        <div className="w-full min-w-0 overflow-hidden">
          <ScribeWorkflowStepper
            activeIndex={resolveScribeWorkflowStepIndex({
              recordState,
              sessionStatus: workspaceState.status,
              pipelineBusy,
              prescriptionApproved: workspaceState.prescriptionApproved,
            })}
            liveRecording={recordState === "recording" || recordState === "paused"}
          />
        </div>
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-4 overflow-visible md:gap-5 lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-stretch lg:gap-6 lg:overflow-hidden min-[1920px]:gap-8">
          <div className="flex min-h-0 min-w-0 flex-[1.25] flex-col overflow-visible lg:h-full lg:flex-none lg:overflow-hidden">
            <ScribeRecordPanel
              recordState={recordState}
              durationLabel={recording.formattedDuration}
              statusMessage={pipelineMessage}
              disabled={Boolean(activeSessionId)}
              analyserNode={recording.analyserNode}
              pauseSupported={recording.pauseSupported}
              transcriptSegments={displayTranscriptSegments}
              highlightedSegmentId={workspaceState.highlightedSegmentId}
              transcriptLoading={
                !isRecordingLive &&
                displayTranscriptSegments.length === 0 &&
                (workspaceState.transcriptLoading || (pipelineBusy && Boolean(activeSessionId)))
              }
              transcriptLoadingMessage={workspaceState.transcriptLoadingMessage ?? pipelineMessage}
              sessionStatus={workspaceState.status}
              canStartNewSession={Boolean(activeSessionId) && !pipelineBusy}
              onStart={() => {
                live.reset();
                void recording.startRecording();
              }}
              onPause={recording.pauseRecording}
              onResume={recording.resumeRecording}
              onStop={handleStopRecording}
              onNewSession={handleNewSession}
              manualMode={manualInputMode}
              onManualModeChange={setManualInputMode}
              onManualSubmit={handleManualTranscriptSubmit}
              manualSubmitting={manualSubmitting}
              canStartRecording={Boolean(selectedPatient)}
              patientRequiredHint="Select a patient to begin"
              sessionContext={recordPanelSessionContext}
              statusStrip={recorderStatus}
              clinicalById={workspaceState.clinicalById}
              onSoapTurnSelectionChange={handleSoapTurnSelectionChange}
            >
              <PatientSelector
                patient={selectedPatient}
                lockSelection={isRecordingLive}
                languageToggle={languageToggle}
                onSelect={(next) => {
                  setSelectedPatient(next);
                  setAppointmentId(next?.appointment_id ?? null);
                }}
                onClear={() => {
                  setSelectedPatient(null);
                  setAppointmentId(null);
                }}
              />
            </ScribeRecordPanel>
          </div>

          <main className="scribe-card flex min-h-[9rem] min-w-0 flex-1 flex-col overflow-hidden rounded-xl lg:h-full lg:min-h-0">
            <div className="min-h-0 flex-1 overflow-hidden">{rightPanel}</div>
          </main>
        </div>
      </div>
      </div>

      {uploadError && (
        <div
          className={cn(
            "fixed inset-x-0 z-40 mx-auto w-full max-w-md px-4",
            manualInputMode
              ? "bottom-[max(1rem,env(safe-area-inset-bottom))]"
              : isRecordingLive
                ? "bottom-[calc(15.25rem+env(safe-area-inset-bottom))]"
                : activeSessionId
                  ? "bottom-[calc(13.25rem+env(safe-area-inset-bottom))]"
                  : "bottom-[calc(10.25rem+env(safe-area-inset-bottom))]",
            "lg:absolute lg:bottom-4 lg:left-1/2 lg:z-30 lg:mx-0 lg:w-full lg:-translate-x-1/2",
          )}
        >
          <UploadErrorBanner
            error={uploadError}
            onDismiss={() => setUploadError(null)}
            onRelease={async () => {
              try {
                await fetch("/api/scribe/sessions/release-blocking", { method: "POST" });
                setUploadError(null);
              } catch (e) {
                setUploadError(e instanceof Error ? e : new Error(String(e)));
              }
            }}
          />
        </div>
      )}

      {toastMessage && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <Toast
            message={toastMessage}
            variant={toastVariant}
            onDismiss={() => setToastMessage(null)}
          />
        </div>
      )}

      {sessionsDrawer}
    </div>
  );
}

function UploadErrorBanner({ error, onDismiss, onRelease }) {
  const isBlocked = error?.code === "SESSION_ALREADY_ACTIVE" ||
    /already active/i.test(error?.message ?? "");

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-center shadow-lg">
      <p className="break-words text-base text-red-600 sm:text-sm">{error.message}</p>
      <div className="flex flex-col items-stretch justify-center gap-2 sm:flex-row sm:items-center">
        {isBlocked && (
          <Button type="button" variant="outline" size="sm" className="min-h-11 w-full cursor-pointer sm:w-auto min-[1920px]:min-h-12 min-[1920px]:text-lg" onClick={onRelease}>
            Clear stuck session
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className="min-h-11 w-full cursor-pointer sm:w-auto min-[1920px]:min-h-12 min-[1920px]:text-lg" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
