"use client";

import { useEffect, useRef, useState } from "react";
import { Heartbeat, Microphone, PencilSimple, Stop } from "@phosphor-icons/react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  applyVitalsAutofill,
  bpRelationshipError,
  describeVitalsUtterance,
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
  sugar_type: "",
  rr: "",
};

const STICKY_KEYS = [
  "bp_systolic",
  "bp_diastolic",
  "pulse",
  "temp",
  "spo2",
  "weight",
  "height",
  "sugar",
  "rr",
];

const FIELD_DEFAULTS = {
  temp_unit: "F",
  sugar_unit: "mg/dL",
  sugar_type: "",
};

const SILENCE_MS = 2000;
const SPEECH_RMS = 0.02;
const HIGHLIGHT_MS = 1600;
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function fieldText(value) {
  return value == null ? "" : String(value);
}

function cloneFields(fields) {
  return { ...EMPTY_FIELDS, ...fields };
}

function sugarKind(type) {
  if (type === "fasting") return "FBS";
  if (type === "pp") return "PP";
  if (type === "random") return "RBS";
  return "Sugar";
}

export function formatVitalsSummary(fields, t, formatNumber) {
  const parts = [];
  if (fieldText(fields.bp_systolic).trim() || fieldText(fields.bp_diastolic).trim()) {
    const systolic = fieldText(fields.bp_systolic).trim();
    const diastolic = fieldText(fields.bp_diastolic).trim();
    parts.push(`${t("bp")} ${systolic ? formatNumber(systolic) : "—"}/${diastolic ? formatNumber(diastolic) : "—"}`);
  }
  if (fieldText(fields.pulse).trim()) parts.push(`${t("pulse")} ${formatNumber(fields.pulse)}`);
  if (fieldText(fields.temp).trim()) {
    const unit = fields.temp_unit === "C" ? "C" : "F";
    parts.push(`${t("temp")} ${formatNumber(fields.temp)}°${unit}`);
  }
  if (fieldText(fields.spo2).trim()) parts.push(`${t("spo2")} ${formatNumber(fields.spo2)}%`);
  if (fieldText(fields.weight).trim()) parts.push(`${t("weight")} ${formatNumber(fields.weight)} kg`);
  if (fieldText(fields.height).trim()) parts.push(`${t("height")} ${formatNumber(fields.height)} cm`);
  if (fieldText(fields.rr).trim()) parts.push(`${t("rr")} ${formatNumber(fields.rr)}/min`);
  if (fieldText(fields.sugar).trim()) {
    const unit = fields.sugar_unit === "mmol/L" ? "mmol/L" : "mg/dL";
    const kind = fields.sugar_type ? sugarKind(fields.sugar_type) : t("sugarShort");
    parts.push(`${kind} ${formatNumber(fields.sugar)} ${unit}`);
  }
  return parts.join(" · ");
}

function formatDisplayNumber(value, locale) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fieldText(value);
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(numeric);
}

function mergeFilled(target, applied) {
  const next = { ...target };
  for (const key of applied.filled) next[key] = applied.next[key];
  if (applied.filled.includes("temp")) next.temp_unit = applied.next.temp_unit ?? next.temp_unit;
  if (applied.filled.includes("sugar")) {
    if (applied.next.sugar_unit) next.sugar_unit = applied.next.sugar_unit;
    if (applied.next.sugar_type) next.sugar_type = applied.next.sugar_type;
  }
  return next;
}

function fieldsEqual(left, right) {
  return Object.keys(EMPTY_FIELDS).every((key) => fieldText(left[key]) === fieldText(right[key]));
}

function micErrorMessage(err, t) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return t("micDenied");
  }
  return t("micUnavailable");
}

export function SayVitalsBar({
  language = "english",
  patientId = null,
  appointmentId = null,
  sessionId = null,
  recordingLive = false,
  transcriptText = "",
}) {
  const t = useTranslations("scribe.vitals");
  const locale = useLocale();
  const formatNumber = (value) => formatDisplayNumber(value, locale);
  const [saved, setSaved] = useState(EMPTY_FIELDS);
  const [draft, setDraft] = useState(EMPTY_FIELDS);
  const [savedHeard, setSavedHeard] = useState("");
  const [heard, setHeard] = useState("");
  const [open, setOpen] = useState(false);
  const [typedFields, setTypedFields] = useState(() => new Set());
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [highlighted, setHighlighted] = useState(() => new Set());
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [vitalsLoadId, setVitalsLoadId] = useState(0);
  const [bpConfirmed, setBpConfirmed] = useState(false);
  const [dismissedNotes, setDismissedNotes] = useState(() => new Set());

  const savedRef = useRef(saved);
  const draftRef = useRef(draft);
  const heardRef = useRef("");
  const savedHeardRef = useRef("");
  const typedRef = useRef(typedFields);
  const typedAtOpenRef = useRef(new Set());
  const openRef = useRef(false);
  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const rafRef = useRef(0);
  const silenceRef = useRef(null);
  const heardSpeechRef = useRef(false);
  const loopRef = useRef(false);
  const appliedTranscriptRef = useRef("");
  const loadReadyRef = useRef(false);
  const acceptClipRef = useRef(false);
  const mountedRef = useRef(true);
  const persistRef = useRef(async () => {});
  const triggerRef = useRef(null);
  const micRef = useRef(null);

  useEffect(() => { savedRef.current = saved; }, [saved]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { typedRef.current = typedFields; }, [typedFields]);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => () => {
    mountedRef.current = false;
    stopTracks();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => micRef.current?.focus(), 0);
    function onKeyDown(event) {
      if (event.key !== "Tab") return;
      const root = document.querySelector("[data-testid='vitals-modal']");
      if (!root) return;
      const focusable = [...root.querySelectorAll(FOCUSABLE)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!patientId) {
      loadReadyRef.current = false;
      return undefined;
    }
    loadReadyRef.current = false;
    appliedTranscriptRef.current = "";
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
        setSaved((current) => {
          const next = applyLoadedVitals(current, vitals);
          savedRef.current = next;
          return next;
        });
        setTypedFields((current) => {
          const next = new Set(current);
          for (const key of STICKY_KEYS) {
            if (vitals[key] != null && String(vitals[key]).trim() !== "") next.add(key);
          }
          typedRef.current = next;
          return next;
        });
        if (vitals.heard_text) {
          setSavedHeard((current) => current || vitals.heard_text);
          savedHeardRef.current = savedHeardRef.current || vitals.heard_text;
        }
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        console.error("visit vitals load failed", err);
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        loadReadyRef.current = true;
        setVitalsLoadId((current) => current + 1);
      });
    return () => controller.abort();
  }, [patientId, appointmentId, sessionId]);

  useEffect(() => {
    if (!loadReadyRef.current) return;
    const text = String(transcriptText ?? "").trim();
    if (!text || text === appliedTranscriptRef.current) return;
    appliedTranscriptRef.current = text;
    const dialogOpen = openRef.current;
    const applied = applyVitalsAutofill({
      current: dialogOpen ? draftRef.current : savedRef.current,
      extracted: extractVitalsFromUtterance(text),
      typedFields: typedRef.current,
      mode: "transcript",
    });
    if (!applied.filled.length) return;
    const savedNext = dialogOpen ? mergeFilled(savedRef.current, applied) : applied.next;
    savedRef.current = savedNext;
    setSaved(savedNext);
    if (dialogOpen) {
      draftRef.current = applied.next;
      setDraft(applied.next);
    }
    flash(applied.filled);
    void persistRef.current(savedNext, heardRef.current || savedHeardRef.current).catch((err) => {
      console.error("visit vitals persist failed", err);
    });
  }, [transcriptText, vitalsLoadId]);

  useEffect(() => {
    if (recordingLive && listening) stopListening();
  }, [recordingLive, listening]);

  function flash(keys) {
    setHighlighted(new Set(keys));
    window.setTimeout(() => {
      if (mountedRef.current) setHighlighted(new Set());
    }, HIGHLIGHT_MS);
  }

  function stopTracks() {
    loopRef.current = false;
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
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
    acceptClipRef.current = true;
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
    loopRef.current = true;
    const tick = () => {
      if (!loopRef.current) return;
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
      setError(micErrorMessage(err, t));
      stopTracks();
      setListening(false);
    }
  }

  function applyExtracted(extracted, { confirmTyped = false } = {}) {
    const applied = applyVitalsAutofill({
      current: draftRef.current,
      extracted,
      typedFields: typedRef.current,
      mode: "voice",
      confirmTyped,
    });
    draftRef.current = applied.next;
    setDraft(applied.next);
    if (applied.filled.length) {
      const savedNext = mergeFilled(savedRef.current, applied);
      savedRef.current = savedNext;
      setSaved(savedNext);
      flash(applied.filled);
      void persistRef.current(savedNext, heardRef.current).catch((err) => {
        console.error("visit vitals persist failed", err);
      });
    }
    setPending(applied.skipped.length && !confirmTyped ? extracted : null);
    setBpConfirmed(false);
    setDismissedNotes(new Set());
  }

  async function transcribeClip(blob) {
    if (!acceptClipRef.current) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("audio", blob, "vitals.webm");
      form.append("language", language);
      const res = await fetch("/api/scribe/vitals/hear", { method: "POST", body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(t("transcribeFailed"));
      if (!acceptClipRef.current) return;
      const transcript = String(payload.transcript ?? "").trim();
      setHeard(transcript);
      heardRef.current = transcript;
      applyExtracted(payload.vitals ?? {}, { confirmTyped: true });
    } catch (err) {
      setError(t("transcribeFailed"));
    } finally {
      setBusy(false);
    }
  }

  function updateField(key, value) {
    if (key === "bp_systolic" || key === "bp_diastolic") setBpConfirmed(false);
    setDismissedNotes((current) => {
      const next = new Set(current);
      next.add(key);
      return next;
    });
    setTypedFields((current) => {
      const next = new Set(current);
      next.add(key);
      typedRef.current = next;
      return next;
    });
    setDraft((current) => {
      const next = { ...current, [key]: value };
      draftRef.current = next;
      return next;
    });
  }

  async function persist(snapshot = draftRef.current, heardText = heardRef.current) {
    if (!patientId) return;
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
    if (!res.ok) throw new Error(t("saveFailed"));
    return payload;
  }
  persistRef.current = persist;

  function openModal() {
    if (!patientId) return;
    const next = cloneFields(savedRef.current);
    draftRef.current = next;
    setDraft(next);
    const heardText = savedHeardRef.current;
    setHeard(heardText);
    heardRef.current = heardText;
    typedAtOpenRef.current = new Set(typedRef.current);
    setPending(null);
    setError("");
    setOpen(true);
  }

  function dirty() {
    return !fieldsEqual(draftRef.current, savedRef.current)
      || (heardRef.current || "") !== (savedHeardRef.current || "");
  }

  function discardDraft() {
    const nextTyped = new Set(typedAtOpenRef.current);
    typedRef.current = nextTyped;
    setTypedFields(nextTyped);
    const next = cloneFields(savedRef.current);
    draftRef.current = next;
    setDraft(next);
    heardRef.current = savedHeardRef.current;
    setHeard(savedHeardRef.current);
    setPending(null);
    setError("");
  }

  function requestClose() {
    if (dirty() && !window.confirm(t("discard"))) return;
    if (dirty()) discardDraft();
    acceptClipRef.current = false;
    stopListening();
    setOpen(false);
  }

  async function saveAndClose() {
    setSaving(true);
    try {
      await persist(draftRef.current, heardRef.current);
      const next = cloneFields(draftRef.current);
      savedRef.current = next;
      setSaved(next);
      savedHeardRef.current = heardRef.current;
      setSavedHeard(heardRef.current);
      setPending(null);
      setOpen(false);
      setToast({ message: t("saveSuccess"), variant: "default" });
    } catch {
      setToast({ message: t("saveFailed"), variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  const summary = formatVitalsSummary(open ? draft : saved, t, formatNumber);
  const flags = vitalRangeFlags(draft);
  const bpBad = bpRelationshipError(draft);
  const notes = heard ? describeVitalsUtterance(heard) : { corrections: [], labelsWithoutValue: [] };
  const inputClass = (key) => cn(
    "w-full min-w-0 rounded-md border bg-white px-2 py-1.5 text-sm tabular-nums text-gray-900",
    bpBad && (key === "bp_systolic" || key === "bp_diastolic")
      ? "border-red-500 ring-2 ring-red-200"
      : flags[key] ? "border-amber-400 ring-2 ring-amber-200" : "border-gray-200",
    highlighted.has(key) && "bg-primary/10 ring-2 ring-primary/30",
  );
  const correctionHint = (...fields) => {
    const parts = [];
    for (const field of fields) {
      if (dismissedNotes.has(field)) continue;
      const hit = notes.corrections.find((item) => item.field === field);
      if (hit) parts.push(t("autoCorrected", { from: hit.from }));
    }
    return parts.length ? parts.join(" ") : null;
  };
  const missingHint = (key) => {
    const empty = key === "bp" ? missed("bp_systolic") || missed("bp_diastolic") : missed(key);
    if (!empty) return null;
    if (notes.labelsWithoutValue.includes(key)) return t("heardNoValue", { label: key });
    return notHeard;
  };

  const buttonTextClass = "h-auto min-h-10 whitespace-normal px-4 py-2 leading-6";
  const heardAttempt = Boolean(String(heard || "").trim());
  const missed = (key) => heardAttempt && !fieldText(draft[key]).trim();
  const notHeard = t("notHeard");

  return (
    <div data-testid="say-vitals">
      <button
        ref={triggerRef}
        type="button"
        data-testid="vitals-summary"
        disabled={!patientId}
        aria-label={summary ? t("chipEdit", { summary }) : t("chipAdd")}
        onClick={openModal}
        className={cn(
          "flex w-full max-w-full items-start gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-semibold leading-6",
          summary
            ? "border-[color:var(--scribe-card-border)] bg-white text-gray-800 hover:bg-gray-50"
            : "border-dashed border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          !patientId && "cursor-not-allowed opacity-50",
        )}
      >
        <Heartbeat size={16} weight="fill" aria-hidden className="mt-1 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 whitespace-normal break-words">{summary || t("chipEmpty")}</span>
        {summary ? <PencilSimple size={14} aria-hidden className="mt-1 shrink-0 text-gray-500" /> : null}
      </button>

      <Dialog open={open} onOpenChange={(next) => { if (!next) requestClose(); }}>
        <DialogContent
          onClose={requestClose}
          closeLabel={t("close")}
          data-testid="vitals-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="vitals-dialog-title"
          className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-auto sm:max-h-[min(90dvh,40rem)] sm:max-w-lg sm:rounded-lg"
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="shrink-0 px-4 pt-4 pr-12 text-left">
              <DialogTitle id="vitals-dialog-title" className="break-words leading-snug">{t("title")}</DialogTitle>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {error ? (
                <InlineAlert message={error} dismissLabel={t("dismiss")} onDismiss={() => setError("")} />
              ) : null}

              <div className="flex flex-col items-center gap-2 py-4">
                <div className="relative flex h-24 w-24 items-center justify-center">
                  {listening ? (
                    <>
                      <span className="absolute inset-0 animate-ping rounded-full bg-red-200" aria-hidden />
                      <span className="absolute inset-2 flex items-end justify-center gap-1" aria-hidden>
                        {[10, 18, 26, 16, 12].map((height, index) => (
                          <span
                            key={index}
                            className="w-1 animate-pulse rounded-full bg-red-500"
                            style={{ height, animationDelay: `${index * 120}ms` }}
                          />
                        ))}
                      </span>
                    </>
                  ) : null}
                  <button
                    ref={micRef}
                    type="button"
                    data-testid="vitals-mic"
                    aria-label={listening ? t("stopSaying") : t("tapToSay")}
                    aria-pressed={listening}
                    disabled={busy || recordingLive}
                    onClick={() => { void toggleListening(); }}
                    className={cn(
                      "relative z-10 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md",
                      listening ? "bg-red-600" : "bg-primary",
                      (busy || recordingLive) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <Microphone size={28} weight="fill" aria-hidden />
                  </button>
                </div>
                <p className="max-w-full break-words px-2 text-center text-sm font-semibold leading-6 text-gray-800">
                  {listening ? t("listening") : t("tapToSay")}
                </p>
                {listening ? (
                  <button
                    type="button"
                    data-testid="vitals-stop"
                    className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-sm font-semibold leading-6 text-red-700"
                    onClick={stopListening}
                  >
                    <Stop size={12} weight="fill" aria-hidden />
                    {t("stop")}
                  </button>
                ) : null}
                {busy ? <p className="text-center text-sm leading-6 text-gray-500">{t("transcribing")}</p> : null}
                <p
                  className="min-h-6 max-w-full break-words text-center text-sm leading-6 text-gray-500"
                  data-testid="vitals-heard"
                  aria-live="polite"
                >
                  {heard ? t("heard", { text: heard }) : ""}
                </p>
              </div>

              {pending ? (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm leading-6 text-gray-700" role="status">
                  <span className="min-w-0 break-words">{t("replacePrompt")}</span>
                  <button
                    type="button"
                    className="rounded-md bg-primary px-2 py-1 font-semibold leading-6 text-white"
                    onClick={() => applyExtracted(pending, { confirmTyped: true })}
                  >
                    {t("replace")}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-gray-200 px-2 py-1 leading-6"
                    onClick={() => setPending(null)}
                  >
                    {t("keepMine")}
                  </button>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={t("bp")}
                  flag={!bpBad && (flags.bp_systolic || flags.bp_diastolic)}
                  flagLabel={t("checkValue")}
                  missing={missingHint("bp")}
                  note={correctionHint("bp_systolic", "bp_diastolic")}
                  error={bpBad ? t("bpInverted") : null}
                  confirmLabel={bpBad && !bpConfirmed ? t("confirmBp") : null}
                  onConfirm={() => setBpConfirmed(true)}
                >
                  <div className="flex items-center gap-1">
                    <input
                      aria-label={t("bpSystolic")}
                      inputMode="numeric"
                      className={inputClass("bp_systolic")}
                      value={fieldText(draft.bp_systolic)}
                      onChange={(event) => updateField("bp_systolic", event.target.value.replace(/[^\d]/g, ""))}
                    />
                    <span className="text-gray-300">/</span>
                    <input
                      aria-label={t("bpDiastolic")}
                      inputMode="numeric"
                      className={inputClass("bp_diastolic")}
                      value={fieldText(draft.bp_diastolic)}
                      onChange={(event) => updateField("bp_diastolic", event.target.value.replace(/[^\d]/g, ""))}
                    />
                  </div>
                </Field>
                <Field label={t("pulse")} flag={flags.pulse} flagLabel={t("checkValue")} missing={missingHint("pulse")} note={correctionHint("pulse")}>
                  <input
                    aria-label={t("pulse")}
                    inputMode="numeric"
                    className={inputClass("pulse")}
                    value={fieldText(draft.pulse)}
                    onChange={(event) => updateField("pulse", event.target.value.replace(/[^\d]/g, ""))}
                  />
                </Field>
                <Field label={t("rr")} flag={flags.rr} flagLabel={t("checkValue")} missing={missingHint("rr")} note={correctionHint("rr")}>
                  <input
                    aria-label={t("rr")}
                    inputMode="numeric"
                    className={inputClass("rr")}
                    value={fieldText(draft.rr)}
                    onChange={(event) => updateField("rr", event.target.value.replace(/[^\d]/g, ""))}
                  />
                </Field>
                <Field label={t("temp")} flag={flags.temp} flagLabel={t("checkValue")} missing={missingHint("temp")} note={correctionHint("temp")}>
                  <div className="flex items-center gap-1">
                    <input
                      aria-label={t("temperature")}
                      inputMode="decimal"
                      className={inputClass("temp")}
                      value={fieldText(draft.temp)}
                      onChange={(event) => updateField("temp", event.target.value.replace(/[^\d.]/g, ""))}
                    />
                    <button
                      type="button"
                      aria-label={t("tempUnit")}
                      className="shrink-0 rounded-md border border-gray-200 px-2 py-1.5 text-sm font-semibold leading-6 text-gray-600"
                      onClick={() => updateField("temp_unit", draft.temp_unit === "C" ? "F" : "C")}
                    >
                      °{draft.temp_unit === "C" ? "C" : "F"}
                    </button>
                  </div>
                </Field>
                <Field label={t("spo2")} flag={flags.spo2} flagLabel={t("checkValue")} missing={missingHint("spo2")} note={correctionHint("spo2")}>
                  <input
                    aria-label={t("spo2")}
                    inputMode="numeric"
                    className={inputClass("spo2")}
                    value={fieldText(draft.spo2)}
                    onChange={(event) => updateField("spo2", event.target.value.replace(/[^\d]/g, ""))}
                  />
                </Field>
                <Field label={t("weight")} flag={flags.weight} flagLabel={t("checkValue")} missing={missingHint("weight")} note={correctionHint("weight")}>
                  <input
                    aria-label={t("weight")}
                    inputMode="decimal"
                    className={inputClass("weight")}
                    value={fieldText(draft.weight)}
                    onChange={(event) => updateField("weight", event.target.value.replace(/[^\d.]/g, ""))}
                  />
                </Field>
                <Field label={t("height")} hint={missed("height") ? null : t("optional")} flag={flags.height} flagLabel={t("checkValue")} missing={missingHint("height")} note={correctionHint("height")}>
                  <input
                    aria-label={t("height")}
                    inputMode="decimal"
                    className={inputClass("height")}
                    value={fieldText(draft.height)}
                    onChange={(event) => updateField("height", event.target.value.replace(/[^\d.]/g, ""))}
                  />
                </Field>
                <Field label={t("sugar")} hint={missed("sugar") ? null : t("optional")} flag={flags.sugar} flagLabel={t("checkValue")} missing={missingHint("sugar")} note={correctionHint("sugar")} className="col-span-2">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label={t("sugarValue")}
                        inputMode="decimal"
                        className={cn(inputClass("sugar"), "min-w-0 flex-1")}
                        value={fieldText(draft.sugar)}
                        onChange={(event) => updateField("sugar", event.target.value.replace(/[^\d.]/g, ""))}
                      />
                      <button
                        type="button"
                        aria-label={t("sugarUnit")}
                        className="shrink-0 rounded-md border border-gray-200 px-2 py-1.5 text-sm font-semibold leading-6 text-gray-600"
                        onClick={() => updateField("sugar_unit", draft.sugar_unit === "mmol/L" ? "mg/dL" : "mmol/L")}
                      >
                        {draft.sugar_unit === "mmol/L" ? "mmol/L" : "mg/dL"}
                      </button>
                    </div>
                    <select
                      aria-label={t("sugarType")}
                      className="w-full min-h-10 rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm leading-6 text-gray-700"
                      value={draft.sugar_type === "fasting" || draft.sugar_type === "pp" || draft.sugar_type === "random" ? draft.sugar_type : ""}
                      onChange={(event) => updateField("sugar_type", event.target.value)}
                    >
                      <option value="">{t("selectType")}</option>
                      <option value="random">{t("random")}</option>
                      <option value="fasting">{t("fasting")}</option>
                      <option value="pp">{t("pp")}</option>
                    </select>
                  </div>
                </Field>
              </div>
            </div>

            <DialogFooter className="shrink-0 flex-wrap gap-2 border-t px-4 py-3">
              <Button type="button" variant="outline" data-testid="vitals-cancel" className={buttonTextClass} onClick={requestClose}>
                {t("cancel")}
              </Button>
              <Button type="button" data-testid="vitals-save" className={buttonTextClass} disabled={saving || (bpBad && !bpConfirmed)} onClick={() => { void saveAndClose(); }}>
                {saving ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex justify-center px-4">
          <Toast
            message={toast.message}
            variant={toast.variant}
            dismissLabel={t("dismiss")}
            onDismiss={() => setToast(null)}
          />
        </div>
      ) : null}
    </div>
  );
}

function applyLoadedVitals(current, vitals) {
  const next = { ...current };
  for (const key of Object.keys(EMPTY_FIELDS)) {
    if (vitals[key] == null || vitals[key] === "") continue;
    const currentValue = String(current[key] ?? "").trim();
    const untouchedDefault = Object.prototype.hasOwnProperty.call(FIELD_DEFAULTS, key)
      && currentValue === FIELD_DEFAULTS[key];
    if (currentValue && !untouchedDefault) continue;
    next[key] = fieldText(vitals[key]);
  }
  return next;
}

function Field({ label, hint, flag, flagLabel, missing, note, error, confirmLabel, onConfirm, className, children }) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="mb-1 flex flex-wrap items-baseline gap-x-1 gap-y-0.5 break-words text-sm font-semibold leading-6 text-gray-500">
        {label}
        {hint ? <span className="font-normal text-gray-400">{hint}</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block break-words text-sm font-medium leading-6 text-red-700" role="alert" data-testid="vitals-bp-error">
          {error}
          {confirmLabel ? (
            <button
              type="button"
              data-testid="vitals-bp-confirm"
              className="ml-2 underline"
              onClick={(event) => {
                event.preventDefault();
                onConfirm?.();
              }}
            >
              {confirmLabel}
            </button>
          ) : null}
        </span>
      ) : null}
      {flag ? <span className="mt-1 block break-words text-sm font-medium leading-6 text-amber-700">{flagLabel}</span> : null}
      {note ? <span className="mt-1 block break-words text-xs leading-5 text-gray-500" data-testid="vitals-corrected">{note}</span> : null}
      {missing ? <span className="mt-1 block break-words text-sm font-medium leading-6 text-gray-700" data-testid="vitals-not-heard">{missing}</span> : null}
    </label>
  );
}

function InlineAlert({ message, onDismiss, dismissLabel }) {
  return (
    <div
      role="alert"
      data-testid="vitals-error"
      className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
    >
      <p className="min-w-0 flex-1 break-words leading-6">{message}</p>
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded px-1 text-base leading-none text-amber-900 hover:bg-amber-100"
        aria-label={dismissLabel}
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
