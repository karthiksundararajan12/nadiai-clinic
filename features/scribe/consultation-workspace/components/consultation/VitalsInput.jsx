"use client";

import { useEffect, useRef, useState } from "react";
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

function Field({ label, children }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-600/30";

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
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      <Field label="BP (mmHg)">
        <div className="flex items-center gap-1">
          <input
            type="text"
            inputMode="numeric"
            className={inputCls}
            placeholder="120"
            value={vitals.bpSys}
            disabled={disabled}
            onChange={(e) => update({ bpSys: e.target.value.replace(/[^\d]/g, "") })}
            onBlur={handleBlur}
          />
          <span className="text-gray-400">/</span>
          <input
            type="text"
            inputMode="numeric"
            className={inputCls}
            placeholder="80"
            value={vitals.bpDia}
            disabled={disabled}
            onChange={(e) => update({ bpDia: e.target.value.replace(/[^\d]/g, "") })}
            onBlur={handleBlur}
          />
        </div>
      </Field>
      <Field label="HR (bpm)">
        <input
          type="text"
          inputMode="numeric"
          className={inputCls}
          value={vitals.hr}
          disabled={disabled}
          onChange={(e) => update({ hr: e.target.value.replace(/[^\d]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
      <Field label="Temp (°F)">
        <input
          type="text"
          inputMode="decimal"
          className={inputCls}
          value={vitals.temp}
          disabled={disabled}
          onChange={(e) => update({ temp: e.target.value.replace(/[^\d.]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
      <Field label="SpO2 (%)">
        <input
          type="text"
          inputMode="numeric"
          className={inputCls}
          value={vitals.spo2}
          disabled={disabled}
          onChange={(e) => update({ spo2: e.target.value.replace(/[^\d]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
      <Field label="Weight (kg)">
        <input
          type="text"
          inputMode="decimal"
          className={inputCls}
          value={vitals.weight}
          disabled={disabled}
          onChange={(e) => update({ weight: e.target.value.replace(/[^\d.]/g, "") })}
          onBlur={handleBlur}
        />
      </Field>
    </div>
  );
}
