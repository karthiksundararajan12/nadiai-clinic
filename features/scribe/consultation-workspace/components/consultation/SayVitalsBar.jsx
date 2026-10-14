"use client";

import { useEffect, useRef, useState } from "react";
import { Microphone } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  applyVitalsAutofill,
  extractVitalsFromUtterance,
  vitalRangeFlags,
} from "../../lib/vitals-utterance.js";

const EMPTY_FIELDS = {
  bp_systolic: "",
  bp_diastolic: "",
  pulse: "",
  temp: "",
  temp_unit: "F",
  spo2: "",
  weight: "",
  height: "",
  sugar: "",
  sugar_unit: "mg/dL",
  sugar_type: "random",
};

const FIELD_DEFAULTS = {
  temp_unit: "F",
  sugar_unit: "mg/dL",
  sugar_type: "random",
};

const SILENCE_MS = 2000;
const SPEECH_RMS = 0.02;
const HIGHLIGHT_MS = 1600;

function fieldText(value) {
  return value == null ? "" : String(value);
}

export function SayVitalsBar({
  language = "english",
  patientId = null,
  appointmentId = null,
  sessionId = null,
  recordingLive = false,
  transcriptText = "",
}) {
  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [typedFields, setTypedFields] = useState(() => new Set());
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState("");
  const [highlighted, setHighlighted] = useState(() => new Set());
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const fieldsRef = useRef(fields);
  const typedRef = useRef(typedFields);
  const heardRef = useRef("");
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const silenceRef = useRef(null);
  const heardSpeechRef = useRef(false);
  const appliedTranscriptRef = useRef("");
  const persistRef = useRef(async () => {});

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  useEffect(() => {
    typedRef.current = typedFields;
  }, [typedFields]);

  useEffect(() => () => stopTracks(), []);

  useEffect(() => {
    if (!patientId) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams();
    params.set("patientId", patientId);
    if (appointmentId) params.set("appointmentId", appointmentId);
    if (sessionId) params.set("sessionId", sessionId);
    fetch(`/api/scribe/visit-vitals?${params.toString()}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((payload) => {
        const vitals = payload?.vitals;
        if (!vitals) return;
        setFields((current) => {
          const next = { ...current };
          for (const key of Object.keys(EMPTY_FIELDS)) {
            if (vitals[key] == null || vitals[key] === "") continue;
            const currentValue = String(current[key] ?? "").trim();
            const untouchedDefault = FIELD_DEFAULTS[key] && currentValue === FIELD_DEFAULTS[key];
            if (currentValue && !untouchedDefault) continue;
            next[key] = fieldText(vitals[key]);
          }
          if (!String(current.temp_unit || "").trim() && vitals.temp_unit) {
            next.temp_unit = vitals.temp_unit;
          }
          return next;
        });
        if (vitals.heard_text) {
          setHeard((current) => current || vitals.heard_text);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [patientId, appointmentId, sessionId]);

  useEffect(() => {
    const text = String(transcriptText ?? "").trim();
    if (!text || text === appliedTranscriptRef.current) return;
    appliedTranscriptRef.current = text;
    const applied = applyVitalsAutofill({
      current: fieldsRef.current,
      extracted: extractVitalsFromUtterance(text),
      mode: "transcript",
    });
    if (!applied.filled.length) return;
    fieldsRef.current = applied.next;
    setFields(applied.next);
    flash(applied.filled);
    void persistRef.current(applied.next, heardRef.current);
  }, [transcriptText]);

  useEffect(() => {
    if (recordingLive && listening) stopListening();
  }, [recordingLive, listening]);

  function flash(keys) {
    setHighlighted(new Set(keys));
    window.setTimeout(() => setHighlighted(new Set()), HIGHLIGHT_MS);
  }

  function stopTracks() {
    if (silenceRef.current) clearTimeout(silenceRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks?.().forEach((track) => track.stop());
    streamRef.current = null;
    audioRef.current?.close?.().catch(() => {});
    audioRef.current = null;
  }

  function stopListening() {
    const recorder = recorderRef.current;
    setListening(false);
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else stopTracks();
  }

  async function startListening() {
    setError("");
    setPending(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const chunks = [];
    const recorder = new MediaRecorder(stream);
    recorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      stopTracks();
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size) void transcribeClip(blob);
    };
    recorder.start();
    setListening(true);
    heardSpeechRef.current = false;
    watchSilence(stream);
  }

  function watchSilence(stream) {
    const context = new AudioContext();
    audioRef.current = context;
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      if (rms > SPEECH_RMS) {
        heardSpeechRef.current = true;
        if (silenceRef.current) {
          clearTimeout(silenceRef.current);
          silenceRef.current = null;
        }
      } else if (heardSpeechRef.current && !silenceRef.current) {
        silenceRef.current = setTimeout(() => stopListening(), SILENCE_MS);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  async function toggleListening() {
    if (busy || recordingLive) return;
    if (listening) {
      stopListening();
      return;
    }
    try {
      await startListening();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Microphone unavailable");
      stopTracks();
      setListening(false);
    }
  }

  function applyExtracted(extracted, { confirmTyped = false } = {}) {
    const applied = applyVitalsAutofill({
      current: fieldsRef.current,
      extracted,
      typedFields: typedRef.current,
      mode: "voice",
      confirmTyped,
    });
    setFields(applied.next);
    fieldsRef.current = applied.next;
    if (applied.filled.length) flash(applied.filled);
    if (applied.skipped.length && !confirmTyped) {
      setPending(extracted);
    } else {
      setPending(null);
    }
    void persist(applied.next, heardRef.current);
  }

  async function transcribeClip(blob) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("audio", blob, "vitals.webm");
      form.append("language", language);
      const res = await fetch("/api/scribe/vitals/hear", { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not transcribe vitals");
      const transcript = String(payload.transcript ?? "").trim();
      setHeard(transcript);
      heardRef.current = transcript;
      applyExtracted(payload.vitals ?? {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not transcribe vitals");
    } finally {
      setBusy(false);
    }
  }

  function updateField(key, value) {
    setTypedFields((current) => {
      const next = new Set(current);
      next.add(key);
      typedRef.current = next;
      return next;
    });
    setFields((current) => {
      const next = { ...current, [key]: value };
      fieldsRef.current = next;
      return next;
    });
  }

  async function persist(snapshot = fieldsRef.current, heardText = heardRef.current) {
    if (!patientId) return;
    setSaveError("");
    try {
      const res = await fetch("/api/scribe/visit-vitals", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId,
          appointmentId,
          sessionId,
          ...snapshot,
          heard_text: heardText || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Could not save vitals");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save vitals");
    }
  }
  persistRef.current = persist;

  const flags = vitalRangeFlags(fields);
  const inputClass = (key) => cn(
    "w-full min-w-0 rounded-md border bg-white px-2 py-1.5 text-sm tabular-nums text-gray-900",
    flags[key] ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200",
    highlighted.has(key) && "bg-primary/10 ring-2 ring-primary/30",
  );

  return (
    <section
      className="rounded-xl border border-[color:var(--scribe-card-border)] bg-[color:var(--scribe-card-bg)] px-3 py-3"
      data-testid="say-vitals"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) void persist();
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Vitals</p>
        <button
          type="button"
          aria-label="Say vitals"
          aria-pressed={listening}
          disabled={busy || recordingLive}
          onClick={() => { void toggleListening(); }}
          className={cn(
            "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
            listening
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
            (busy || recordingLive) && "cursor-not-allowed opacity-60",
          )}
        >
          <Microphone size={14} weight="fill" aria-hidden />
          {listening ? "Listening" : "Say vitals"}
        </button>
      </div>

      {listening && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-red-700" role="status">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" aria-hidden />
          Listening…
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="BP" flag={flags.bp_systolic || flags.bp_diastolic}>
          <div className="flex items-center gap-1">
            <input
              aria-label="BP systolic"
              inputMode="numeric"
              className={inputClass("bp_systolic")}
              value={fieldText(fields.bp_systolic)}
              onChange={(event) => updateField("bp_systolic", event.target.value.replace(/[^\d]/g, ""))}
            />
            <span className="text-gray-300">/</span>
            <input
              aria-label="BP diastolic"
              inputMode="numeric"
              className={inputClass("bp_diastolic")}
              value={fieldText(fields.bp_diastolic)}
              onChange={(event) => updateField("bp_diastolic", event.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
        </Field>
        <Field label="Pulse" flag={flags.pulse}>
          <input
            aria-label="Pulse"
            inputMode="numeric"
            className={inputClass("pulse")}
            value={fieldText(fields.pulse)}
            onChange={(event) => updateField("pulse", event.target.value.replace(/[^\d]/g, ""))}
          />
        </Field>
        <Field label="Temp" flag={flags.temp}>
          <div className="flex items-center gap-1">
            <input
              aria-label="Temperature"
              inputMode="decimal"
              className={inputClass("temp")}
              value={fieldText(fields.temp)}
              onChange={(event) => updateField("temp", event.target.value.replace(/[^\d.]/g, ""))}
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-gray-200 px-1.5 py-1 text-[10px] font-semibold text-gray-600"
              onClick={() => updateField("temp_unit", fields.temp_unit === "C" ? "F" : "C")}
            >
              °{fields.temp_unit === "C" ? "C" : "F"}
            </button>
          </div>
        </Field>
        <Field label="SpO2" flag={flags.spo2}>
          <input
            aria-label="SpO2"
            inputMode="numeric"
            className={inputClass("spo2")}
            value={fieldText(fields.spo2)}
            onChange={(event) => updateField("spo2", event.target.value.replace(/[^\d]/g, ""))}
          />
        </Field>
        <Field label="Weight" flag={flags.weight}>
          <input
            aria-label="Weight"
            inputMode="decimal"
            className={inputClass("weight")}
            value={fieldText(fields.weight)}
            onChange={(event) => updateField("weight", event.target.value.replace(/[^\d.]/g, ""))}
          />
        </Field>
        <Field label="Height" hint="optional">
          <input
            aria-label="Height"
            inputMode="decimal"
            className={inputClass("height")}
            value={fieldText(fields.height)}
            onChange={(event) => updateField("height", event.target.value.replace(/[^\d.]/g, ""))}
          />
        </Field>
        <Field label="Sugar (RBS/FBS)" hint="optional" flag={flags.sugar} className="col-span-2">
          <div className="flex items-center gap-1">
            <input
              aria-label="Sugar"
              inputMode="decimal"
              className={inputClass("sugar")}
              value={fieldText(fields.sugar)}
              onChange={(event) => updateField("sugar", event.target.value.replace(/[^\d.]/g, ""))}
            />
            <button
              type="button"
              aria-label="Sugar unit"
              className="shrink-0 rounded-md border border-gray-200 px-1.5 py-1 text-[10px] font-semibold text-gray-600"
              onClick={() => updateField("sugar_unit", fields.sugar_unit === "mmol/L" ? "mg/dL" : "mmol/L")}
            >
              {fields.sugar_unit === "mmol/L" ? "mmol/L" : "mg/dL"}
            </button>
            <select
              aria-label="Sugar type"
              className="shrink-0 rounded-md border border-gray-200 bg-white px-1 py-1 text-[10px] font-semibold text-gray-700"
              value={fields.sugar_type === "fasting" || fields.sugar_type === "pp" ? fields.sugar_type : "random"}
              onChange={(event) => updateField("sugar_type", event.target.value)}
            >
              <option value="random">Random</option>
              <option value="fasting">Fasting</option>
              <option value="pp">PP</option>
            </select>
          </div>
        </Field>
      </div>

      {heard ? (
        <p className="mt-2 text-xs text-gray-500" data-testid="vitals-heard">
          Heard: {heard}
        </p>
      ) : null}
      {pending ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-700" role="status">
          <span>Replace the values you already typed?</span>
          <button
            type="button"
            className="rounded-md bg-primary px-2 py-1 font-semibold text-white"
            onClick={() => applyExtracted(pending, { confirmTyped: true })}
          >
            Replace
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-200 px-2 py-1"
            onClick={() => setPending(null)}
          >
            Keep mine
          </button>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      {saveError ? <p className="mt-2 text-xs text-red-600">{saveError}</p> : null}
      {busy ? <p className="mt-2 text-xs text-gray-500">Transcribing vitals…</p> : null}
    </section>
  );
}

function Field({ label, hint, flag, className, children }) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="mb-1 flex items-baseline gap-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
        {hint ? <span className="font-normal normal-case text-gray-400">{hint}</span> : null}
      </span>
      {children}
      {flag ? <span className="mt-1 block text-[10px] font-medium text-amber-700">Check this value</span> : null}
    </label>
  );
}
