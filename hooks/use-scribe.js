"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export function useScribe() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [language, setLanguage] = useState("hinglish");
  const [transcription, setTranscription] = useState([]);
  const [clinicalNote, setClinicalNote] = useState("");
  const [duration, setDuration] = useState(0);
  const [transcriptionError, setTranscriptionError] = useState(null);
  const timerRef = useRef(null);

  const startRecording = useCallback(() => {
    setIsRecording(true);
    setIsPaused(false);
    setTranscription([]);
    setClinicalNote("");
    setTranscriptionError(null);
    setDuration(0);

    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const pauseRecording = useCallback(() => {
    setIsPaused(true);
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const resumeRecording = useCallback(() => {
    setIsPaused(false);
    timerRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setIsPaused(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (transcription.length === 0) {
      setTranscriptionError("Transcript not available.");
    }
  }, [transcription.length]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    isRecording,
    isPaused,
    language,
    setLanguage,
    transcription,
    clinicalNote,
    transcriptionError,
    duration,
    isGeneratingNote: false,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
  };
}
