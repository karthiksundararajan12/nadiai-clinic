"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow, format } from "date-fns";
import { Users, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { ICON_SIZE_MD, ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";
import { Header } from "@/components/layout/header";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import { ApproximateDobBadge } from "@/components/shared/approximate-dob-badge";
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
import {
  createPatient,
  buildHighlightRedirectPath,
  fetchPatientDeletionImpact,
  deletePatient,
} from "@/features/patients/patients.client";
import { formatDateOnly } from "@/lib/date-only";
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

export default function PatientsPage() {
  return (
    <Suspense
      fallback={
        <>
          <Header
            title="Patients"
            subtitle="Manage your clinic's patient records"
          />
          <p className="p-6 text-sm font-medium text-muted-foreground">Loading patients…</p>
        </>
      }
    >
      <PatientsPageContent />
    </Suspense>
  );
}

function PatientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const highlightRef = useRef(null);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [patients, setPatients] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [newPatient, setNewPatient] = useState({
    name: "",
    age: "",
    gender: "Male",
    dateOfBirth: "",
    phone: "",
  });

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [deleteStep, setDeleteStep] = useState(1);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

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
      params.set("range", range);
      if (search) params.set("search", search);
      if (range === "custom") {
        if (from) params.set("from", from);
        if (to) params.set("to", to);
      }

      const response = await fetch(`/api/patients?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load patients");
      }
      setPatients(Array.isArray(payload.patients) ? payload.patients : []);
      setTotal(Number(payload.total) || 0);
      setHasMore(Boolean(payload.hasMore));
    } catch (loadError) {
      setError(loadError);
      setPatients([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [offset, range, search, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!highlightId || loading || patients.length === 0) return;
    const el = highlightRef.current ?? document.getElementById(`patient-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, loading, patients]);

  function updateRange(next) {
    setRange(next);
    setOffset(0);
  }

  async function openDeleteDialog(patient, event) {
    event?.stopPropagation?.();
    if (!patient?.id) return;
    setDeleteError("");
    setDeleteTarget(patient);
    setDeleteImpact(null);
    setDeleteStep(1);
    setDeleteLoading(true);
    try {
      const payload = await fetchPatientDeletionImpact(patient.id);
      setDeleteImpact(payload.impact ?? null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  }

  function closeDeleteDialog() {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteImpact(null);
    setDeleteStep(1);
    setDeleteError("");
  }

  async function confirmDeletePatient() {
    if (!deleteTarget?.id) return;
    if (deleteImpact?.blocked) return;
    if (deleteStep === 1) {
      setDeleteStep(2);
      return;
    }
    setDeleting(true);
    setDeleteError("");
    try {
      await deletePatient(deleteTarget.id);
      closeDeleteDialog();
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddPatient() {
    setSaveError("");
    setSaving(true);
    try {
      const result = await createPatient(newPatient);
      setNewPatient({ name: "", age: "", gender: "Male", dateOfBirth: "", phone: "" });
      setDialogOpen(false);
      await load();
      const redirectPath = buildHighlightRedirectPath(result.patient?.id);
      if (redirectPath) {
        router.push(redirectPath);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + patients.length, total);
  const canPrev = offset > 0;
  const canNext = hasMore;

  return (
    <>
      <Header
        title="Patients"
        subtitle="Manage your clinic's patient records"
      />

      <div className="flex-1 space-y-4 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="Search by name or phone…"
              className="w-full sm:w-72"
            />

            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Registered</Label>
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
                  <Label className="text-xs font-medium text-muted-foreground">From</Label>
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
                  <Label className="text-xs font-medium text-muted-foreground">To</Label>
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
            <p className="text-sm font-medium text-muted-foreground">
              {loading ? "Loading…" : `${total} patient${total === 1 ? "" : "s"}`}
            </p>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setSaveError("");
                setDialogOpen(true);
              }}
            >
              <Plus className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
              Add Patient
            </Button>
          </div>
        </div>

        {error && (
          <p className="text-sm font-medium text-destructive">{error.message}</p>
        )}

        {loading ? (
          <p className="py-16 text-center text-sm font-medium text-muted-foreground">
            Loading patients…
          </p>
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients found"
            description="Try adjusting search or filters. Add your first patient or wait for bookings to create records automatically."
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className={`${ICON_SIZE_SM} mr-1.5`} strokeWidth={ICON_STROKE} />
                Add Patient
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-left text-base">
                <thead className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Name</th>
                    <th className="px-4 py-3 font-semibold">Phone</th>
                    <th className="px-4 py-3 font-semibold">Age / DOB</th>
                    <th className="px-4 py-3 font-semibold">Last Appointment</th>
                    <th className="px-4 py-3 font-semibold">Total Visits</th>
                    <th className="px-4 py-3 font-semibold">Registered On</th>
                    <th className="px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {patients.map((patient) => {
                    const highlighted = highlightId === patient.id;
                    return (
                    <tr
                      key={patient.id}
                      id={`patient-${patient.id}`}
                      ref={highlighted ? highlightRef : null}
                      className={cn(
                        "cursor-pointer hover:bg-muted/30",
                        highlighted && "ring-2 ring-inset ring-primary",
                      )}
                      onClick={() => router.push(`/patients/${patient.id}`)}
                    >
                      <td className="px-4 py-3 font-medium text-foreground">
                        {patient.name}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {patient.phone || "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        <span>{formatAgeDob(patient)}</span>
                        {patient.dateOfBirthIsApproximate && (
                          <ApproximateDobBadge className="ml-1.5" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {patient.lastAppointmentLabel ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {patient.totalVisits}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-muted-foreground">
                        <div title={formatAbsolute(patient.createdAt)}>
                          {formatRelative(patient.createdAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          title="Delete patient permanently"
                          aria-label={`Delete ${patient.name}`}
                          onClick={(event) => openDeleteDialog(patient, event)}
                        >
                          <Trash2 className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                        </Button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground">
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent onClose={() => setDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add New Patient</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="patient-name">Full Name</Label>
              <Input
                id="patient-name"
                placeholder="Enter patient's full name"
                value={newPatient.name}
                disabled={saving}
                onChange={(e) =>
                  setNewPatient((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="patient-age">Age (optional)</Label>
                <Input
                  id="patient-age"
                  type="number"
                  min={0}
                  max={150}
                  placeholder="Age"
                  value={newPatient.age}
                  disabled={saving}
                  onChange={(e) =>
                    setNewPatient((prev) => ({
                      ...prev,
                      age: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Gender (optional)</Label>
                <div className="flex gap-2">
                  {["Male", "Female", "Other"].map((g) => (
                    <button
                      key={g}
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        setNewPatient((prev) => ({ ...prev, gender: g }))
                      }
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                        newPatient.gender === g
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-dob">Date of Birth (optional)</Label>
              <Input
                id="patient-dob"
                type="date"
                max={new Date().toISOString().slice(0, 10)}
                value={newPatient.dateOfBirth}
                disabled={saving}
                onChange={(e) =>
                  setNewPatient((prev) => ({
                    ...prev,
                    dateOfBirth: e.target.value,
                  }))
                }
              />
              <p className="text-xs font-medium text-muted-foreground">
                For pediatric clinics, this automatically schedules the standard IAP vaccination reminders.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="patient-phone">Phone Number</Label>
              <Input
                id="patient-phone"
                placeholder="+91 98765 43210"
                value={newPatient.phone}
                disabled={saving}
                onChange={(e) =>
                  setNewPatient((prev) => ({
                    ...prev,
                    phone: e.target.value,
                  }))
                }
              />
            </div>
            {saveError && (
              <p className="text-sm font-medium text-destructive">{saveError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddPatient}
              disabled={saving || !newPatient.name.trim() || !newPatient.phone.trim()}
            >
              {saving ? "Saving…" : "Add Patient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) closeDeleteDialog();
        }}
      >
        <DialogContent onClose={closeDeleteDialog} className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteStep === 1 ? "Delete patient?" : "Permanently delete patient?"}
            </DialogTitle>
          </DialogHeader>
          {deleteLoading ? (
            <p className="text-sm text-muted-foreground">Checking linked records…</p>
          ) : deleteImpact?.blocked ? (
            <p className="text-sm text-destructive">
              This patient has {deleteImpact.paidUnrefundedAppointments} paid
              appointment
              {deleteImpact.paidUnrefundedAppointments === 1 ? "" : "s"} that
              {deleteImpact.paidUnrefundedAppointments === 1 ? " has" : " have"} not
              been refunded. Cancel those appointments first to issue refunds,
              then delete the patient.
            </p>
          ) : deleteStep === 1 ? (
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Permanently delete{" "}
                <span className="font-medium text-foreground">
                  {deleteTarget?.name ?? "this patient"}
                </span>
                ? This removes the patient and all linked history listed below.
                This cannot be undone.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <span className="font-medium text-foreground">
                    {deleteImpact?.appointments ?? 0}
                  </span>{" "}
                  appointment{(deleteImpact?.appointments ?? 0) === 1 ? "" : "s"}
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    {deleteImpact?.bookingInvoices ?? 0}
                  </span>{" "}
                  booking invoice
                  {(deleteImpact?.bookingInvoices ?? 0) === 1 ? "" : "s"}
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    {deleteImpact?.scribeSessions ?? 0}
                  </span>{" "}
                  scribe session
                  {(deleteImpact?.scribeSessions ?? 0) === 1 ? "" : "s"}
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    {deleteImpact?.vaccinationSchedules ?? 0}
                  </span>{" "}
                  vaccination schedule row
                  {(deleteImpact?.vaccinationSchedules ?? 0) === 1 ? "" : "s"}
                </li>
                <li>
                  <span className="font-medium text-foreground">
                    {deleteImpact?.vitals ?? 0}
                  </span>{" "}
                  vitals record{(deleteImpact?.vitals ?? 0) === 1 ? "" : "s"}
                </li>
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Confirm permanent deletion of{" "}
              <span className="font-medium text-foreground">
                {deleteTarget?.name ?? "this patient"}
              </span>{" "}
              and all linked appointments, invoices, scribe sessions,
              vaccinations, and vitals. This is irreversible.
            </p>
          )}
          {deleteError ? (
            <p className="text-sm font-medium text-destructive">{deleteError}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={deleting} onClick={closeDeleteDialog}>
              Keep patient
            </Button>
            {!deleteImpact?.blocked ? (
              <Button
                variant="destructive"
                disabled={deleting || deleteLoading}
                onClick={confirmDeletePatient}
              >
                {deleting
                  ? "Deleting…"
                  : deleteStep === 1
                    ? "Continue"
                    : "Permanently Delete"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function formatAgeDob(patient) {
  const parts = [];
  if (patient.age != null) parts.push(`${patient.age} yrs`);
  // date_of_birth is a date-only "YYYY-MM-DD" column — use the
  // timezone-safe manual-parse formatter (@/lib/date-only), not date-fns'
  // `format(new Date(...))`, which round-trips through local-timezone
  // conversion and can shift the displayed calendar date by a day.
  if (patient.dateOfBirth) parts.push(formatDateOnly(patient.dateOfBirth));
  return parts.length > 0 ? parts.join(" · ") : "—";
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
