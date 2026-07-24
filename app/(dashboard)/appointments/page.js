"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Mic,
  Plus,
} from "lucide-react";
import { ICON_SIZE_MD, ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";
import { Header } from "@/components/layout/header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatPaymentStatusLabel } from "@/features/booking/lib/payment-list.js";
import { formatPhoneForDisplay, normalizePhoneForWhatsApp } from "@/features/booking/lib/phone.js";
import { fetchAppointmentById } from "@/features/appointments/appointments.client.js";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const DEBOUNCE_MS = 300;

const RANGE_OPTIONS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "completed", label: "Completed" },
  { value: "rescheduled", label: "Rescheduled" },
];

const PAYMENT_STATUS_PILL = {
  paid: "border-success/30 bg-success/10 text-success",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  refunded: "border-border bg-muted text-muted-foreground",
  pending: "border-warning/30 bg-warning/10 text-warning",
  not_required: "border-border bg-muted text-muted-foreground",
};

const REFUND_STATUS_PILL = {
  completed: "border-success/30 bg-success/10 text-success",
  processing: "border-warning/30 bg-warning/10 text-warning",
  pending: "border-warning/30 bg-warning/10 text-warning",
  failed: "border-destructive/30 bg-destructive/10 text-destructive",
  not_applicable: "border-border bg-muted text-muted-foreground",
};

const ACTIONABLE_STATUSES = new Set([
  "pending",
  "payment_pending",
  "confirmed",
  "reschedule_requested",
]);

const CONSULTATION_STATUSES = new Set([
  "pending",
  "payment_pending",
  "confirmed",
]);

function clinicDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export default function AppointmentsPage() {
  return (
    <Suspense
      fallback={
        <>
          <Header
            title="Appointments"
            subtitle="Clinic schedule, payment, and refund status"
          />
          <p className="p-6 text-sm text-muted-foreground">Loading appointments…</p>
        </>
      }
    >
      <AppointmentsPageContent />
    </Suspense>
  );
}

function AppointmentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const detailIdFromUrl = searchParams.get("appointmentId");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [appointments, setAppointments] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailError, setDetailError] = useState("");
  const [actionError, setActionError] = useState("");

  const [patients, setPatients] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [newApt, setNewApt] = useState({ patientId: "", date: "", time: "" });

  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time: "" });
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");

  const today = clinicDateKey();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setOffset(0);
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      params.set("status", status);
      params.set("range", range);
      if (search) params.set("search", search);
      if (range === "custom") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }

      const response = await fetch(`/api/appointments?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load appointments");
      }
      setAppointments(Array.isArray(payload.appointments) ? payload.appointments : []);
      setTotal(Number(payload.total) || 0);
      setHasMore(Boolean(payload.hasMore));
    } catch (loadError) {
      setError(loadError);
      setAppointments([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [offset, status, range, search, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = useCallback(async (appointmentId) => {
    if (!appointmentId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailError("");
    setActionError("");
    try {
      const appointment = await fetchAppointmentById(appointmentId);
      setDetail(appointment);
    } catch (err) {
      setDetail(null);
      setDetailError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (detailIdFromUrl) {
      void openDetail(detailIdFromUrl);
    }
  }, [detailIdFromUrl, openDetail]);

  function closeDetail() {
    setDetailOpen(false);
    setDetail(null);
    setDetailError("");
    setActionError("");
    if (detailIdFromUrl) {
      router.replace("/appointments");
    }
  }

  function updateStatus(next) {
    setStatus(next);
    setOffset(0);
  }

  function updateRange(next) {
    setRange(next);
    setOffset(0);
  }

  async function ensurePatientsLoaded() {
    if (patients.length > 0) return;
    const response = await fetch("/api/appointments?scope=all", {
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(payload.patients)) {
      setPatients(payload.patients);
    }
  }

  async function handleAddAppointment() {
    if (!(newApt.patientId && newApt.date && newApt.time)) return;
    setSaving(true);
    setFormError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newApt),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create appointment");
      }
      setNewApt({ patientId: "", date: "", time: "" });
      setDialogOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelAppointment(appointmentId) {
    setActionError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", appointmentId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to cancel appointment");
      }
      closeDetail();
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  }

  function openRescheduleDialog(appointment) {
    setRescheduleTarget(appointment);
    setRescheduleForm({
      date: appointment.date ?? today,
      time: "",
    });
    setRescheduleError("");
  }

  async function handleRescheduleAppointment() {
    if (!rescheduleTarget || !rescheduleForm.date || !rescheduleForm.time) return;
    setRescheduling(true);
    setRescheduleError("");
    try {
      const response = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          appointmentId: rescheduleTarget.id,
          date: rescheduleForm.date,
          time: rescheduleForm.time,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to reschedule appointment");
      }
      setRescheduleTarget(null);
      closeDetail();
      await load();
    } catch (err) {
      setRescheduleError(err instanceof Error ? err.message : String(err));
    } finally {
      setRescheduling(false);
    }
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + appointments.length, total);
  const canPrev = offset > 0;
  const canNext = hasMore;
  const selectedPatient = patients.find((p) => p.id === newApt.patientId);

  return (
    <>
      <Header
        title="Appointments"
        subtitle="Clinic schedule, payment, and refund status"
      />

      <div className="flex-1 space-y-4 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search patient or phone…"
              className="w-full sm:w-72"
            />

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={updateStatus}>
                {({ open, setOpen, value, onValueChange }) => (
                  <>
                    <SelectTrigger
                      open={open}
                      onClick={() => setOpen(!open)}
                      className="w-[160px]"
                    >
                      {STATUS_OPTIONS.find((o) => o.value === value)?.label ?? "Status"}
                    </SelectTrigger>
                    <SelectContent open={open}>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          selected={option.value === value}
                          onSelect={() => {
                            onValueChange(option.value);
                            setOpen(false);
                          }}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </>
                )}
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Slot date</Label>
              <Select value={range} onValueChange={updateRange}>
                {({ open, setOpen, value, onValueChange }) => (
                  <>
                    <SelectTrigger
                      open={open}
                      onClick={() => setOpen(!open)}
                      className="w-[160px]"
                    >
                      {RANGE_OPTIONS.find((o) => o.value === value)?.label ?? "Date"}
                    </SelectTrigger>
                    <SelectContent open={open}>
                      {RANGE_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value}
                          selected={option.value === value}
                          onSelect={() => {
                            onValueChange(option.value);
                            setOpen(false);
                          }}
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </>
                )}
              </Select>
            </div>

            {range === "custom" && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">From</Label>
                  <Input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setOffset(0);
                    }}
                    className="w-[150px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">To</Label>
                  <Input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setOffset(0);
                    }}
                    className="w-[150px]"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {loading ? "Loading…" : `${total} appointment${total === 1 ? "" : "s"}`}
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                setFormError("");
                setDialogOpen(true);
                try {
                  await ensurePatientsLoaded();
                } catch {
                  /* patient list is optional for opening the dialog */
                }
              }}
            >
              <Plus className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
              New Appointment
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error.message}</p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading appointments…
          </p>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointments found"
            description="Try adjusting search or filters. Booked appointments appear here."
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Patient</th>
                    <th className="px-4 py-3 font-medium">Slot</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Payment</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Refund</th>
                    <th className="px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3 font-medium"> </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {appointments.map((appointment) => (
                    <tr key={appointment.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium text-foreground">
                        <div>{appointment.patientName}</div>
                        {appointment.contactPhone ? (
                          <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                            {formatPhoneForDisplay(appointment.contactPhone)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {appointment.slotLabel ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={appointment.status} />
                      </td>
                      <td className="px-4 py-3">
                        {appointment.paymentStatus &&
                        appointment.paymentStatus !== "not_required" &&
                        appointment.paymentStatusLabel !== "—" ? (
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
                      <td className="px-4 py-3">
                        {appointment.status === "cancelled" &&
                        appointment.refundStatus &&
                        appointment.refundStatus !== "not_applicable" ? (
                          <span
                            className={cn(
                              "inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                              REFUND_STATUS_PILL[appointment.refundStatus] ??
                                "border-border bg-muted text-muted-foreground",
                            )}
                          >
                            {appointment.refundStatusLabel}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div title={formatAbsolute(appointment.createdAt)}>
                          {formatRelative(appointment.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-primary"
                          onClick={() => openDetail(appointment.id)}
                        >
                          View
                          <ExternalLink
                            className={`${ICON_SIZE_SM} opacity-70`}
                            strokeWidth={ICON_STROKE}
                          />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                Showing {pageStart}–{pageEnd} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canPrev || loading}
                  onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                  className="gap-1"
                >
                  <ChevronLeft className={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canNext || loading}
                  onClick={() => setOffset(offset + PAGE_SIZE)}
                  className="gap-1"
                >
                  Next
                  <ChevronRight className={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={detailOpen} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent onClose={closeDetail} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Appointment detail</DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading…
            </p>
          ) : detailError ? (
            <p className="text-sm text-destructive">{detailError}</p>
          ) : detail ? (
            <div className="space-y-4 py-2">
              <div>
                <p className="text-base font-medium text-foreground">
                  {detail.patient_name}
                </p>
                {detail.contact_phone ? (
                  <a
                    href={`tel:+${normalizePhoneForWhatsApp(detail.contact_phone)}`}
                    className="text-sm text-muted-foreground hover:underline"
                  >
                    {formatPhoneForDisplay(detail.contact_phone)}
                  </a>
                ) : null}
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Slot</dt>
                  <dd className="mt-0.5 text-foreground">
                    {detail.date} · {detail.time}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Duration</dt>
                  <dd className="mt-0.5 text-foreground">{detail.duration} min</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge status={detail.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Payment</dt>
                  <dd className="mt-0.5 text-foreground">
                    {detail.payment_status &&
                    detail.payment_status !== "not_required"
                      ? formatPaymentStatusLabel(detail.payment_status)
                      : "—"}
                    {detail.payment_amount != null
                      ? ` · ${formatAmount(detail.payment_amount)}`
                      : ""}
                  </dd>
                </div>
                {detail.status === "cancelled" ? (
                  <div className="col-span-2">
                    <dt className="text-xs text-muted-foreground">Refund</dt>
                    <dd className="mt-0.5 text-foreground">
                      {detail.refund_status ?? "—"}
                      {detail.refund_id ? ` · ${detail.refund_id}` : ""}
                    </dd>
                  </div>
                ) : null}
              </dl>

              {actionError ? (
                <p className="text-sm text-destructive">{actionError}</p>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                {CONSULTATION_STATUSES.has(detail.status) ? (
                  <Link href={`/scribe?appointment_id=${detail.id}`}>
                    <Button variant="outline" size="sm" className="gap-1">
                      <Mic className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                      Start consultation
                    </Button>
                  </Link>
                ) : null}
                {ACTIONABLE_STATUSES.has(detail.status) ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRescheduleDialog(detail)}
                    >
                      Reschedule
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleCancelAppointment(detail.id)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeDetail}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>New Appointment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="relative z-50 space-y-2">
              <Label>Patient</Label>
              <Select
                value={newApt.patientId}
                onValueChange={(patientId) =>
                  setNewApt((prev) => ({ ...prev, patientId }))
                }
              >
                {({ open, setOpen, value, onValueChange }) => (
                  <>
                    <SelectTrigger
                      open={open}
                      onClick={() => setOpen(!open)}
                      disabled={patients.length === 0}
                    >
                      {selectedPatient?.name ?? "Choose a patient"}
                    </SelectTrigger>
                    <SelectContent open={open}>
                      {patients.map((patient) => (
                        <SelectItem
                          key={patient.id}
                          value={patient.id}
                          selected={patient.id === value}
                          onSelect={() => {
                            onValueChange(patient.id);
                            setOpen(false);
                          }}
                        >
                          {patient.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </>
                )}
              </Select>
              {patients.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Add a patient before creating an appointment.
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  min={today}
                  value={newApt.date}
                  onChange={(e) =>
                    setNewApt((prev) => ({ ...prev, date: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={newApt.time}
                  onChange={(e) =>
                    setNewApt((prev) => ({ ...prev, time: e.target.value }))
                  }
                />
              </div>
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddAppointment}
              disabled={
                saving || !newApt.patientId || !newApt.date || !newApt.time
              }
            >
              {saving ? "Booking…" : "Book Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rescheduleTarget)}
        onOpenChange={(open) => !open && setRescheduleTarget(null)}
      >
        <DialogContent onClose={() => setRescheduleTarget(null)}>
          <DialogHeader>
            <DialogTitle>Reschedule Appointment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {rescheduleTarget && (
              <p className="text-sm text-muted-foreground">
                {rescheduleTarget.patient_name} — currently {rescheduleTarget.date}{" "}
                at {rescheduleTarget.time}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>New Date</Label>
                <Input
                  type="date"
                  min={today}
                  value={rescheduleForm.date}
                  onChange={(e) =>
                    setRescheduleForm((prev) => ({
                      ...prev,
                      date: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>New Time</Label>
                <Input
                  type="time"
                  value={rescheduleForm.time}
                  onChange={(e) =>
                    setRescheduleForm((prev) => ({
                      ...prev,
                      time: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
            {rescheduleError && (
              <p className="text-sm text-destructive">{rescheduleError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRescheduleTarget(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRescheduleAppointment}
              disabled={
                rescheduling || !rescheduleForm.date || !rescheduleForm.time
              }
            >
              {rescheduling ? "Rescheduling…" : "Confirm Reschedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatAmount(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  const n = Number(amount);
  return `₹${Number.isInteger(n) ? String(n) : n.toFixed(2)}`;
}

function formatRelative(iso) {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true });
  } catch {
    return "";
  }
}

function formatAbsolute(iso) {
  if (!iso) return "";
  try {
    return format(new Date(iso), "dd MMM yyyy, h:mm a");
  } catch {
    return iso ?? "";
  }
}
