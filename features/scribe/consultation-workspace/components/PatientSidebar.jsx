"use client";

import { Heart, Pill, Thermometer, User, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

function Section({ title, children, className }) {
  return (
    <div className={cn("space-y-2", className)}>
      <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

export function PatientSidebar({ patient, sessionDate, className }) {
  const name = patient?.name ?? "Walk-in Patient";
  const mrn = patient?.id ? `MRN-${String(patient.id).slice(0, 8).toUpperCase()}` : "Not linked";

  return (
    <aside
      className={cn(
        "flex min-h-0 flex-col border-r bg-muted/20 w-full lg:w-[260px] shrink-0",
        className,
      )}
    >
      <div className="shrink-0 border-b px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {patientInitials(name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{name}</p>
            <p className="text-[10px] text-muted-foreground font-mono">{mrn}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div className="rounded-lg border bg-background p-3 space-y-2">
          <InfoRow label="Age" value={patient?.age ? `${patient.age} Years` : null} />
          <InfoRow label="Gender" value={patient?.gender} />
          <InfoRow label="Visit Type" value={patient?.visit_type ?? "Consultation"} />
          <InfoRow
            label="Date & Time"
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
          <p className="text-xs text-muted-foreground rounded-md bg-background border px-2.5 py-2">
            {patient?.allergies ?? "No known allergies"}
          </p>
        </Section>

        <Section title="Current Medications">
          {patient?.medications?.length ? (
            <ul className="space-y-1.5">
              {patient.medications.map((med, i) => (
                <li key={i} className="flex items-start gap-2 text-xs rounded-md bg-background border px-2.5 py-2">
                  <Pill className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span>{med}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground rounded-md bg-background border px-2.5 py-2">
              {patient?.condition ? `Known: ${patient.condition}` : "No medications on file"}
            </p>
          )}
        </Section>

        <Section title="Previous Visit">
          <p className="text-xs text-muted-foreground leading-relaxed rounded-md bg-background border px-2.5 py-2">
            {patient?.last_visit_summary ??
              (patient?.last_visit
                ? `Last visit: ${new Date(patient.last_visit).toLocaleDateString()}`
                : "No previous visit summary")}
          </p>
        </Section>

        <Section title="Vitals (Today)">
          <div className="grid grid-cols-3 gap-2">
            <VitalChip icon={Thermometer} label="Temp" value={patient?.vitals?.temp ?? "—"} />
            <VitalChip icon={Weight} label="Weight" value={patient?.vitals?.weight ?? "—"} />
            <VitalChip icon={Heart} label="HR" value={patient?.vitals?.hr ?? "—"} />
          </div>
        </Section>
      </div>

      <div className="shrink-0 border-t p-3">
        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary w-full justify-start gap-1.5">
          <User className="h-3.5 w-3.5" />
          View Full History
        </Button>
      </div>
    </aside>
  );
}

function VitalChip({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-lg border bg-background p-2 text-center">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-[9px] text-muted-foreground">{label}</span>
      <span className="text-[10px] font-semibold">{value}</span>
    </div>
  );
}
