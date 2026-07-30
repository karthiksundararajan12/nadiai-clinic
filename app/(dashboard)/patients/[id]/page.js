"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowLeft, Cake, Phone, Syringe } from "lucide-react";
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
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading patient…
          </p>
        ) : error ? (
          <p className="py-16 text-center text-sm text-destructive">
            {error.message || "Failed to load patient"}
          </p>
        ) : !patient ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
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
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatGenderAge(patient)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
                  <span className="tabular-nums">
                    {patient.totalVisits} visit{patient.totalVisits === 1 ? "" : "s"}
                  </span>
                  <span>Registered {formatRegisteredOn(patient.createdAt)}</span>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-3">
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Phone className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                  <a href={`tel:+${patient.phone?.replace(/\D/g, "")}`} className="hover:underline">
                    {patient.phone || "—"}
                  </a>
                </div>
                <div className="flex items-center gap-2 text-sm text-foreground">
                  <Cake className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                  <span>
                    {patient.dateOfBirth ? formatDateOnly(patient.dateOfBirth) : "DOB not recorded"}
                  </span>
                  {patient.dateOfBirthIsApproximate && <ApproximateDobBadge />}
                </div>
                <div className="text-sm text-muted-foreground">
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
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Slot</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Payment</th>
                          <th className="px-4 py-3 font-medium">Amount</th>
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
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Vaccine</th>
                          <th className="px-4 py-3 font-medium">Due Date</th>
                          <th className="px-4 py-3 font-medium">Status</th>
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

// created_at is a real timestamptz (unlike date_of_birth/due_date, which are
// date-only columns formatted via @/lib/date-only), so round-tripping
// through `new Date(...)` here is safe.
function formatRegisteredOn(iso) {
  if (!iso) return "—";
  try {
    return `on ${format(new Date(iso), "dd MMM yyyy")}`;
  } catch {
    return iso ?? "—";
  }
}
