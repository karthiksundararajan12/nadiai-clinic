"use client";

import { useEffect, useRef, useState } from "react";
import {
  detectionCardVisible,
  extractionShouldRun,
} from "../lib/patient-extraction.js";
import { toPatientChip } from "../lib/confirm-detected-patient.js";

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Could not confirm the patient");
  }
  return payload;
}

export function usePatientCapture({ enabled, speechMs, transcript, patientId, sessionId }) {
  const [detected, setDetected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [existingPrompt, setExistingPrompt] = useState("");
  const [existingPatient, setExistingPatient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const stoppedRef = useRef(false);
  const lastSpeechRef = useRef(null);
  const runRef = useRef(0);
  const wasEnabledRef = useRef(false);
  const detectedRef = useRef(null);

  useEffect(() => {
    if (enabled && !wasEnabledRef.current && !patientId) {
      stoppedRef.current = false;
      lastSpeechRef.current = null;
      detectedRef.current = null;
    }
    wasEnabledRef.current = Boolean(enabled);
  }, [enabled, patientId]);

  const [seenPatientId, setSeenPatientId] = useState(patientId);
  if (patientId !== seenPatientId) {
    setSeenPatientId(patientId);
    if (patientId) {
      setDetected(null);
      setDraft(null);
      setExistingPrompt("");
      setExistingPatient(null);
    }
  }

  useEffect(() => {
    if (!patientId) return;
    stoppedRef.current = true;
    detectedRef.current = null;
    runRef.current += 1;
  }, [patientId]);

  useEffect(() => {
    if (!enabled || patientId || stoppedRef.current) return;
    if (!extractionShouldRun({
      speechMs,
      lastSpeechMs: lastSpeechRef.current,
      stopped: stoppedRef.current,
    })) return;
    const text = String(transcript ?? "").trim();
    if (!text) return;
    lastSpeechRef.current = speechMs;
    const runId = runRef.current + 1;
    runRef.current = runId;
    fetch("/api/scribe/extract-patient", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript: text }),
    })
      .then((response) => readJson(response))
      .then((payload) => {
        if (runRef.current !== runId || stoppedRef.current) return;
        const patient = payload.patient;
        if (!detectionCardVisible(patient)) return;
        const previous = detectedRef.current;
        detectedRef.current = patient;
        setDetected(patient);
        setDraft((current) => {
          const untouched = !current || JSON.stringify(current) === JSON.stringify(previous);
          return untouched ? patient : current;
        });
      })
      .catch(() => {});
  }, [enabled, patientId, speechMs, transcript]);

  function dismiss() {
    stoppedRef.current = true;
    runRef.current += 1;
    detectedRef.current = null;
    setDetected(null);
    setDraft(null);
    setExistingPrompt("");
    setExistingPatient(null);
    setError("");
  }

  async function confirm(action = "confirm") {
    const fields = draft ?? detected;
    if (!fields) return null;
    setBusy(true);
    setError("");
    try {
      const payload = await readJson(await fetch("/api/scribe/confirm-patient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          sessionId,
          name: fields.name,
          age: fields.age,
          age_unit: fields.age_unit,
          sex: fields.sex,
          phone: fields.phone,
          patientId: existingPatient?.id,
        }),
      }));
      if (payload.action === "confirm-existing") {
        setExistingPrompt(payload.prompt || "");
        setExistingPatient(payload.patient);
        return null;
      }
      const patient = payload.patient;
      stoppedRef.current = true;
      detectedRef.current = null;
      setDetected(null);
      setDraft(null);
      setExistingPrompt("");
      setExistingPatient(null);
      return toPatientChip({ ...fields, sex: fields.sex, gender: patient?.gender }, patient?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the patient");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return {
    detected,
    draft,
    setDraft,
    existingPrompt,
    busy,
    error,
    dismiss,
    confirm: () => confirm(existingPrompt ? "create-new" : "confirm"),
    useExisting: () => confirm("use-existing"),
    createNew: () => confirm("create-new"),
  };
}
