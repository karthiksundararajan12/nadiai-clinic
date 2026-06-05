"use client";

import { ArrowRight, Heart, Pill, Thermometer, User, Weight } from "lucide-react";
import { ScribePanelCard } from "./ScribePanelCard.jsx";

function patientInitials(name) {
  return (name ?? "P")
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-[13px]">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900 text-right">{value ?? "—"}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function PatientSidebar({ patient, sessionDate }) {
  const name = patient?.name ?? "Walk-in Patient";
  const mrn = patient?.id ? `MRN-${String(patient.id).slice(0, 8).toUpperCase()}` : "Not linked";

  return (
    <ScribePanelCard
      title="Patient Context"
      subtitle="Clinical background for this visit"
      footer={
        <div className="px-5 py-3">
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-[13px] font-medium text-indigo-600 hover:text-indigo-700"
          >
            <User className="h-3.5 w-3.5" />
            View full history
            <ArrowRight className="ml-auto h-3.5 w-3.5" />
          </button>
        </div>
      }
    >
      <div className="shrink-0 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-100 to-slate-200 text-sm font-semibold text-slate-700 ring-2 ring-white shadow-sm">
            {patientInitials(name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-slate-900">{name}</p>
            <p className="font-mono text-[11px] text-slate-400">{mrn}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 space-y-0.5">
          <InfoRow label="Age" value={patient?.age ? `${patient.age} years` : null} />
          <InfoRow label="Gender" value={patient?.gender} />
          <InfoRow label="Visit type" value={patient?.visit_type ?? "Consultation"} />
          <InfoRow
            label="Date & time"
            value={
              sessionDate
                ? new Date(sessionDate).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : null
            }
          />
        </div>

        <Section title="Allergies">
          <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-600">
            {patient?.allergies ?? "No known allergies"}
          </p>
        </Section>

        <Section title="Current medications">
          {patient?.medications?.length ? (
            <ul className="space-y-2">
              {patient.medications.map((med, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-[13px] text-slate-700"
                >
                  <Pill className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                  <span>{med}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-[13px] text-slate-500">
              {patient?.condition ? `Known condition: ${patient.condition}` : "No medications on file"}
            </p>
          )}
        </Section>

        <Section title="Previous visit">
          <p className="rounded-lg border border-slate-200/80 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-slate-600">
            {patient?.last_visit_summary ??
              (patient?.last_visit
                ? `Last visit ${new Date(patient.last_visit).toLocaleDateString()}`
                : "No previous visit summary available")}
          </p>
        </Section>

        <Section title="Vitals today">
          <div className="grid grid-cols-3 gap-2">
            <VitalChip icon={Thermometer} label="Temp" value={patient?.vitals?.temp ?? "—"} />
            <VitalChip icon={Weight} label="Weight" value={patient?.vitals?.weight ?? "—"} />
            <VitalChip icon={Heart} label="HR" value={patient?.vitals?.hr ?? "—"} />
          </div>
        </Section>
      </div>
    </ScribePanelCard>
  );
}

function VitalChip({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border border-slate-200/80 bg-white p-2.5 text-center">
      <Icon className="h-3.5 w-3.5 text-slate-400" />
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
      <span className="text-[12px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}
