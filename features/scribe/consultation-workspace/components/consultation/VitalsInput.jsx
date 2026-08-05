"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  buildObjectiveWithVitals,
  parseVitalsFromObjective,
  stripVitalsFromObjective,
} from "../../lib/vitals-objective.js";

export {
  buildObjectiveWithVitals,
  formatVitalsString,
  parseVitalsFromObjective,
  stripVitalsFromObjective,
} from "../../lib/vitals-objective.js";

function Field({ label, unit, children }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        {label}
        {unit && <span className="ml-1 font-normal normal-case text-gray-400">{unit}</span>}
      </p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full min-w-0 bg-white border border-gray-200 rounded-md px-2 py-1.5 text-sm tabular-nums text-gray-900 shadow-sm transition-all duration-200 focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/20";

const VITALS_COMMIT_DELAY_MS = 2000;

export function VitalsInput({ value, onChange, disabled }) {
  const [vitals, setVitals] = useState(() => parseVitalsFromObjective(value));
  const lastEmittedRef = useRef(value ?? "");
  const commitTimerRef = useRef(null);
  const vitalsRef = useRef(vitals);
  const valueRef = useRef(value);

  useEffect(() => {
    vitalsRef.current = vitals;
  }, [vitals]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    const external = value ?? "";
    if (external === lastEmittedRef.current) return;
    setVitals(parseVitalsFromObjective(external));
    lastEmittedRef.current = external;
  }, [value]);

  useEffect(() => () => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
  }, []);

  const commit = (nextVitals = vitalsRef.current) => {
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    const body = stripVitalsFromObjective(valueRef.current ?? "");
    const combined = buildObjectiveWithVitals(nextVitals, body);
    if (combined === lastEmittedRef.current) return;
    lastEmittedRef.current = combined;
    onChange?.(combined);
  };

  const scheduleCommit = (nextVitals) => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
    commitTimerRef.current = setTimeout(() => commit(nextVitals), VITALS_COMMIT_DELAY_MS);
  };

  const update = (patch) => {
    const next = { ...vitalsRef.current, ...patch };
    setVitals(next);
    scheduleCommit(next);
  };

  const handleBlur = () => {
    commit();
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      <Field label="BP" unit="mmHg">
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            className={cn(inputCls, "text-center")}
            placeholder="—"
            value={vitals.bpSys}
            disabled={disabled}
            onChange={(e) => update({ bpSys: e.target.value.replace(/[^\d]/g, "") })}
            onBlur={handleBlur}
          />
          <span className="shrink-0 text-sm font-medium text-gray-300">/</span>
          <input
            type="text"
            inputMode="numeric"
            className={cn(inputCls, "text-center")}
            placeholder="—"
            value={vitals.bpDia}
            disabled={disabled}
            onChange={(e) => update({ bpDia: e.target.value.replace(/[^\d]/g, "") })}
            onBlur={handleBlur}
          />
        </div>
      </Field>
      <Field label="HR" unit="bpm">
        <input
          type="text"
          inputMode="numeric"
          className={cn(inputCls, "text-center")}
          placeholder="—"
          value={vitals.hr}
          disabled={disabled}
          onChange={(e) => update({ hr: e.target.value.replace(/[^\d]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
      <Field label="Temp" unit="°F">
        <input
          type="text"
          inputMode="decimal"
          className={cn(inputCls, "text-center")}
          placeholder="—"
          value={vitals.temp}
          disabled={disabled}
          onChange={(e) => update({ temp: e.target.value.replace(/[^\d.]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
      <Field label="SpO2" unit="%">
        <input
          type="text"
          inputMode="numeric"
          className={cn(inputCls, "text-center")}
          placeholder="—"
          value={vitals.spo2}
          disabled={disabled}
          onChange={(e) => update({ spo2: e.target.value.replace(/[^\d]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
      <Field label="Weight" unit="kg">
        <input
          type="text"
          inputMode="decimal"
          className={cn(inputCls, "text-center")}
          placeholder="—"
          value={vitals.weight}
          disabled={disabled}
          onChange={(e) => update({ weight: e.target.value.replace(/[^\d.]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
    </div>
  );
}
