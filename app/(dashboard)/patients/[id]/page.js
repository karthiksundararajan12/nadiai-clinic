"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { Activity, ArrowLeft, Cake, Phone, Syringe } from "lucide-react";
import { ICON_SIZE_MD, ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { ApproximateDobBadge } from "@/components/shared/approximate-dob-badge";
import { fetchPatientDetail } from "@/features/patients/patients.client";
import { formatDateOnly } from "@/lib/date-only";
import { cn } from "@/lib/utils";

const PAYMENT_STATUS_PILL = {
  paid: "border-success/30 bg-success/10 text-success",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  refunded: "border-border bg-muted text-muted-foreground",
  pending: "border-warning/30 bg-warning/10 text-warning",
  not_required: "border-border bg-muted text-muted-foreground",
};

const VACCINATION_STATUS_PILL = {
  pending: "border-warning/30 bg-warning/10 text-warning",
  reminder_sent: "border-primary/30 bg-primary/10 text-primary",
  completed: "border-success/30 bg-success/10 text-success",
  overdue: "border-destructive/30 bg-destructive/10 text-destructive",
  reminder_failed: "border-destructive/50 bg-destructive/20 text-destructive",
};

export default function PatientDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [patient, setPatient] = useState(null);
  const [appointmentHistory, setAppointmentHistory] = useState([]);
  const [vaccinations, setVaccinations] = useState([]);
  const [vitals, setVitals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const payload = await fetchPatientDetail(id);
        if (cancelled) return;
        setPatient(payload.patient ?? null);
        setAppointmentHistory(
          Array.isArray(payload.appointmentHistory) ? payload.appointmentHistory : [],
        );
        setVaccinations(Array.isArray(payload.vaccinations) ? payload.vaccinations : []);
        setVitals(Array.isArray(payload.vitals) ? payload.vitals : []);
      } catch (loadError) {
        if (!cancelled) setError(loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <>
      <Header
        title="Patient"
        subtitle={patient?.name ?? "Details"}
      />
      <div className="flex-1 space-y-6 p-6">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push("/patients")}
        >
          <ArrowLeft className={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
          All patients
        </Button>

        {loading ? (
          <p className="py-16 text-center text-sm font-medium text-muted-foreground">
            Loading patient…
          </p>
        ) : error ? (
          <p className="py-16 text-center text-sm font-medium text-destructive">
            {error.message || "Failed to load patient"}
          </p>
        ) : !patient ? (
          <p className="py-16 text-center text-sm font-medium text-muted-foreground">
            Patient not found
          </p>
        ) : (
          <>
            <div className="rounded-xl border border-border bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="font-display text-xl font-semibold text-foreground">
                    {patient.name}
                  </h1>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {formatGenderAge(patient)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-sm font-medium text-muted-foreground">
                  <span className="tabular-nums">
                    {patient.totalVisits} visit{patient.totalVisits === 1 ? "" : "s"}
                  </span>
                  <span>Registered {formatRegisteredOn(patient.createdAt)}</span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-3">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Phone className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                  <a href={`tel:+${patient.phone?.replace(/\D/g, "")}`} className="hover:underline">
                    {patient.phone || "—"}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Cake className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                  <span>
                    {patient.dateOfBirth ? formatDateOnly(patient.dateOfBirth) : "DOB not recorded"}
                  </span>
                  {patient.dateOfBirthIsApproximate && <ApproximateDobBadge />}
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Last appointment: {patient.lastAppointmentLabel ?? "—"}
                </div>
              </div>
            </div>

            <section className="space-y-3">
              <h2 className="font-display text-base font-semibold text-foreground">
                Appointment history
              </h2>
              {appointmentHistory.length === 0 ? (
                <EmptyState
                  title="No appointments yet"
                  description="Appointments booked for this patient will appear here."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-base">
                      <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Slot</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                          <th className="px-4 py-3 font-semibold">Payment</th>
                          <th className="px-4 py-3 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {appointmentHistory.map((appointment) => (
                          <tr key={appointment.id}>
                            <td className="px-4 py-3 text-muted-foreground">
                              {appointment.slotLabel ?? "—"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={appointment.status} />
                            </td>
                            <td className="px-4 py-3">
                              {appointment.paymentStatusLabel !== "—" ? (
                                <span
                                  className={cn(
                                    "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                                    PAYMENT_STATUS_PILL[appointment.paymentStatus] ??
                                      "border-border bg-muted text-muted-foreground",
                                  )}
                                >
                                  {appointment.paymentStatusLabel}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums text-foreground">
                              {formatAmount(appointment.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
                <Activity className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                Vitals
              </h2>
              {vitals.length === 0 ? (
                <EmptyState
                  title="No vitals recorded"
                  description="Vitals recorded from an appointment will appear here."
                />
              ) : (
                <div className="space-y-3">
                  {(() => {
                    const [latest, ...history] = vitals;
                    return (
                      <>
                        <div className="rounded-xl border border-border bg-white p-4">
                          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">
                              Latest reading
                            </p>
                            <p className="text-xs font-medium text-muted-foreground">
                              {formatRecordedAt(latest.recordedAt)}
                            </p>
                          </div>
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                            <VitalStat
                              label="Blood pressure"
                              value={formatBloodPressure(
                                latest.bloodPressureSystolic,
                                latest.bloodPressureDiastolic,
                              )}
                            />
                            <VitalStat
                              label="Temperature"
                              value={formatWithUnit(latest.temperatureCelsius, "°C")}
                            />
                            <VitalStat
                              label="Pulse"
                              value={formatWithUnit(latest.pulseBpm, "bpm")}
                            />
                            <VitalStat
                              label="SpO2"
                              value={formatWithUnit(latest.spo2Percent, "%")}
                            />
                            <VitalStat
                              label="Weight"
                              value={formatWithUnit(latest.weightKg, "kg")}
                            />
                            <VitalStat
                              label="Height"
                              value={formatWithUnit(latest.heightCm, "cm")}
                            />
                          </dl>
                          {latest.notes ? (
                            <p className="mt-3 border-t border-border pt-3 text-sm font-medium text-muted-foreground">
                              {latest.notes}
                            </p>
                          ) : null}
                        </div>

                        {history.length > 0 ? (
                          <div className="overflow-hidden rounded-xl border border-border bg-white">
                            <div className="border-b border-border px-4 py-2.5">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Earlier readings
                              </p>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[720px] text-left text-base">
                                <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  <tr>
                                    <th className="px-4 py-3 font-semibold">Recorded</th>
                                    <th className="px-4 py-3 font-semibold">BP</th>
                                    <th className="px-4 py-3 font-semibold">Temp</th>
                                    <th className="px-4 py-3 font-semibold">Pulse</th>
                                    <th className="px-4 py-3 font-semibold">SpO2</th>
                                    <th className="px-4 py-3 font-semibold">Weight</th>
                                    <th className="px-4 py-3 font-semibold">Notes</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                  {history.map((reading) => (
                                    <tr key={reading.id}>
                                      <td className="px-4 py-3 text-muted-foreground">
                                        {formatRecordedAt(reading.recordedAt)}
                                      </td>
                                      <td className="px-4 py-3 tabular-nums text-foreground">
                                        {formatBloodPressure(
                                          reading.bloodPressureSystolic,
                                          reading.bloodPressureDiastolic,
                                        )}
                                      </td>
                                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                        {formatWithUnit(reading.temperatureCelsius, "°C")}
                                      </td>
                                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                        {formatWithUnit(reading.pulseBpm, "bpm")}
                                      </td>
                                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                        {formatWithUnit(reading.spo2Percent, "%")}
                                      </td>
                                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                                        {formatWithUnit(reading.weightKg, "kg")}
                                      </td>
                                      <td className="px-4 py-3 text-muted-foreground">
                                        {reading.notes || "—"}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <h2 className="flex items-center gap-1.5 font-display text-base font-semibold text-foreground">
                <Syringe className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                Vaccination schedule
              </h2>
              {vaccinations.length === 0 ? (
                <EmptyState
                  title="No vaccination schedule"
                  description="No IAP schedule was auto-seeded and none has been manually added for this patient."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-left text-base">
                      <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Vaccine</th>
                          <th className="px-4 py-3 font-semibold">Due Date</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {vaccinations.map((vaccination) => (
                          <tr key={vaccination.id}>
                            <td className="px-4 py-3 font-medium text-foreground">
                              {vaccination.vaccineName}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDateOnly(vaccination.dueDate)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={cn(
                                  "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                                  VACCINATION_STATUS_PILL[vaccination.status] ??
                                    "border-border bg-muted text-muted-foreground",
                                )}
                              >
                                {vaccination.statusLabel}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function formatGenderAge(patient) {
  const parts = [];
  if (patient.age != null) parts.push(`${patient.age} yrs`);
  if (patient.gender) parts.push(patient.gender);
  return parts.length > 0 ? parts.join(" · ") : "Details not recorded";
}

function formatAmount(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  const n = Number(amount);
  return `₹${Number.isInteger(n) ? String(n) : n.toFixed(2)}`;
}

// created_at / recorded_at are real timestamptz values (unlike date_of_birth /
// due_date, which are date-only columns formatted via @/lib/date-only), so
// round-tripping through `new Date(...)` here is safe.
function formatRegisteredOn(iso) {
  if (!iso) return "—";
  try {
    return `on ${format(new Date(iso), "dd MMM yyyy")}`;
  } catch {
    return iso ?? "—";
  }
}

function formatRecordedAt(iso) {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "dd MMM yyyy, h:mm a");
  } catch {
    return iso ?? "—";
  }
}

function formatWithUnit(value, unit) {
  if (value == null || value === "") return "—";
  return `${value} ${unit}`;
}

function formatBloodPressure(systolic, diastolic) {
  if (systolic == null && diastolic == null) return "—";
  return `${systolic ?? "—"}/${diastolic ?? "—"} mmHg`;
}

function VitalStat({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
