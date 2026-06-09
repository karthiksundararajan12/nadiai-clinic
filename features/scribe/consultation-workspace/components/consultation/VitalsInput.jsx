"use client";

import { useEffect, useState } from "react";

const EMPTY = { bpSys: "", bpDia: "", hr: "", temp: "", spo2: "", weight: "" };

export function formatVitalsString(vitals) {
  const parts = [];
  if (vitals.bpSys || vitals.bpDia) parts.push(`BP: ${vitals.bpSys || "—"}/${vitals.bpDia || "—"} mmHg`);
  if (vitals.hr) parts.push(`HR: ${vitals.hr} bpm`);
  if (vitals.temp) parts.push(`Temp: ${vitals.temp} °F`);
  if (vitals.spo2) parts.push(`SpO2: ${vitals.spo2}%`);
  if (vitals.weight) parts.push(`Weight: ${vitals.weight} kg`);
  return parts.join(" | ");
}

export function parseVitalsFromObjective(text = "") {
  const line = String(text).split("\n").find((l) => l.startsWith("Vitals:"));
  if (!line) return { ...EMPTY };
  const vitals = { ...EMPTY };
  const bp = line.match(/BP:\s*(\d+)\/(\d+)/);
  if (bp) { vitals.bpSys = bp[1]; vitals.bpDia = bp[2]; }
  const hr = line.match(/HR:\s*(\d+)/);
  if (hr) vitals.hr = hr[1];
  const temp = line.match(/Temp:\s*([\d.]+)/);
  if (temp) vitals.temp = temp[1];
  const spo2 = line.match(/SpO2:\s*(\d+)/);
  if (spo2) vitals.spo2 = spo2[1];
  const weight = line.match(/Weight:\s*([\d.]+)/);
  if (weight) vitals.weight = weight[1];
  return vitals;
}

export function stripVitalsFromObjective(text = "") {
  return String(text)
    .split("\n")
    .filter((l) => !l.startsWith("Vitals:"))
    .join("\n")
    .trim();
}

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

export function VitalsInput({ value, onChange, disabled }) {
  const [vitals, setVitals] = useState(() => parseVitalsFromObjective(value));

  useEffect(() => {
    setVitals(parseVitalsFromObjective(value));
  }, [value]);

  const update = (patch) => {
    const next = { ...vitals, ...patch };
    setVitals(next);
    const formatted = formatVitalsString(next);
    const body = stripVitalsFromObjective(value);
    const combined = formatted
      ? `Vitals: ${formatted}${body ? `\n\n${body}` : ""}`
      : body;
    onChange?.(combined);
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
            onChange={(e) => update({ bpSys: e.target.value })}
          />
          <span className="text-gray-400">/</span>
          <input
            type="text"
            inputMode="numeric"
            className={inputCls}
            placeholder="80"
            value={vitals.bpDia}
            disabled={disabled}
            onChange={(e) => update({ bpDia: e.target.value })}
          />
        </div>
      </Field>
      <Field label="HR (bpm)">
        <input type="text" inputMode="numeric" className={inputCls} value={vitals.hr} disabled={disabled} onChange={(e) => update({ hr: e.target.value })} />
      </Field>
      <Field label="Temp (°F)">
        <input type="text" inputMode="decimal" className={inputCls} value={vitals.temp} disabled={disabled} onChange={(e) => update({ temp: e.target.value })} />
      </Field>
      <Field label="SpO2 (%)">
        <input type="text" inputMode="numeric" className={inputCls} value={vitals.spo2} disabled={disabled} onChange={(e) => update({ spo2: e.target.value })} />
      </Field>
      <Field label="Weight (kg)">
        <input type="text" inputMode="decimal" className={inputCls} value={vitals.weight} disabled={disabled} onChange={(e) => update({ weight: e.target.value })} />
      </Field>
    </div>
  );
}
