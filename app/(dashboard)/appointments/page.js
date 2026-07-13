"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { SearchInput } from "@/components/shared/search-input";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAppointmentsData } from "@/hooks/use-appointments-data";
import {
  Plus,
  CalendarDays,
  Clock,
  User,
} from "lucide-react";

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

function AppointmentList({ items, loading, onCancel, onReschedule }) {
  if (loading) {
    return (
      <p className="px-6 py-16 text-center text-sm text-muted-foreground">
        Loading appointments…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No appointments found"
        description="There are no appointments matching your criteria"
      />
    );
  }

  return (
    <div className="divide-y divide-border">
      {items.map((appointment) => {
        const clinicDate = new Date(`${appointment.date}T00:00:00+05:30`);
        return (
          <div
            key={appointment.id}
            className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/5 text-primary">
              <span className="text-xs font-semibold">
                {clinicDate.toLocaleDateString("en-IN", { day: "2-digit" })}
              </span>
              <span className="text-[10px] uppercase">
                {clinicDate.toLocaleDateString("en-IN", { month: "short" })}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {appointment.patient_name}
              </p>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {appointment.time}
                </span>
                {appointment.type && <span>{appointment.type}</span>}
                <span>{appointment.duration} min</span>
                {appointment.contact_phone && (
                  <a
                    href={`tel:${appointment.contact_phone}`}
                    className="text-muted-foreground hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {appointment.contact_phone}
                  </a>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {appointment.payment_amount != null && (
                <span className="text-sm text-muted-foreground">
                  ₹{appointment.payment_amount}
                </span>
              )}
              <StatusBadge status={appointment.status} />
              {["pending", "payment_pending", "confirmed"].includes(
                appointment.status,
              ) && (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => onReschedule(appointment)}
                  >
                    Reschedule
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="text-destructive"
                    onClick={() => onCancel(appointment.id)}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AppointmentsPage() {
  const {
    appointments,
    patients,
    loading,
    error,
    addAppointment,
    cancelAppointment,
    updateAppointment,
  } = useAppointmentsData();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionError, setActionError] = useState("");
  const [newApt, setNewApt] = useState({
    patientId: "",
    date: "",
    time: "",
  });
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState({ date: "", time: "" });
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");

  const filteredAppointments = appointments.filter(
    (a) =>
      a.patient_name.toLowerCase().includes(search.toLowerCase()) ||
      (a.type ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const today = clinicDateKey();

  const todayApts = filteredAppointments.filter(
    (a) => a.date === today
  );
  const upcomingApts = filteredAppointments.filter(
    (a) => a.date > today
  );
  const pastApts = filteredAppointments.filter(
    (a) => a.date < today
  );
  const countLabel = (count) => {
    if (loading) return "—";
    return count === 0 ? "No data" : count;
  };
  const selectedPatient = patients.find(
    (patient) => patient.id === newApt.patientId,
  );

  const handleAddAppointment = async () => {
    if (newApt.patientId && newApt.date && newApt.time) {
      setSaving(true);
      setFormError("");
      try {
        await addAppointment(newApt);
      } catch (appointmentError) {
        setFormError(appointmentError.message);
        setSaving(false);
        return;
      }
      setNewApt({
        patientId: "",
        date: "",
        time: "",
      });
      setSaving(false);
      setDialogOpen(false);
    }
  };

  const handleCancelAppointment = async (appointmentId) => {
    setActionError("");
    try {
      await cancelAppointment(appointmentId);
    } catch (appointmentError) {
      setActionError(appointmentError.message);
    }
  };

  const openRescheduleDialog = (appointment) => {
    setRescheduleTarget(appointment);
    setRescheduleForm({ date: appointment.date, time: "" });
    setRescheduleError("");
  };

  const handleRescheduleAppointment = async () => {
    if (!rescheduleTarget || !rescheduleForm.date || !rescheduleForm.time) return;
    setRescheduling(true);
    setRescheduleError("");
    try {
      await updateAppointment(rescheduleTarget.id, {
        date: rescheduleForm.date,
        time: rescheduleForm.time,
      });
    } catch (appointmentError) {
      setRescheduleError(appointmentError.message);
      setRescheduling(false);
      return;
    }
    setRescheduling(false);
    setRescheduleTarget(null);
  };

  return (
    <>
      <Header
        title="Appointments"
        subtitle="Manage and track all your patient appointments"
      />

      <div className="flex-1 p-6 space-y-6">
        {(error || actionError) && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {actionError || error.message}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search appointments..."
              className="w-64"
            />
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => setDialogOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            New Appointment
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <CalendarDays className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{countLabel(todayApts.length)}</p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/10 p-2">
                <Clock className="h-4 w-4 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold">{countLabel(upcomingApts.length)}</p>
                <p className="text-xs text-muted-foreground">Upcoming</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2">
                <User className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{countLabel(pastApts.length)}</p>
                <p className="text-xs text-muted-foreground">Past</p>
              </div>
            </div>
          </Card>
        </div>

        <Card>
          <Tabs defaultValue="today">
            <CardHeader className="pb-0">
              <TabsList>
                <TabsTrigger value="today">
                  Today ({todayApts.length})
                </TabsTrigger>
                <TabsTrigger value="upcoming">
                  Upcoming ({upcomingApts.length})
                </TabsTrigger>
                <TabsTrigger value="past">
                  Past ({pastApts.length})
                </TabsTrigger>
                <TabsTrigger value="all">
                  All ({filteredAppointments.length})
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <TabsContent value="today">
                <AppointmentList
                  items={todayApts}
                  loading={loading}
                  onCancel={handleCancelAppointment}
                  onReschedule={openRescheduleDialog}
                />
              </TabsContent>
              <TabsContent value="upcoming">
                <AppointmentList
                  items={upcomingApts}
                  loading={loading}
                  onCancel={handleCancelAppointment}
                  onReschedule={openRescheduleDialog}
                />
              </TabsContent>
              <TabsContent value="past">
                <AppointmentList
                  items={pastApts}
                  loading={loading}
                  onCancel={handleCancelAppointment}
                  onReschedule={openRescheduleDialog}
                />
              </TabsContent>
              <TabsContent value="all">
                <AppointmentList
                  items={filteredAppointments}
                  loading={loading}
                  onCancel={handleCancelAppointment}
                  onReschedule={openRescheduleDialog}
                />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent onClose={() => setDialogOpen(false)}>
            <DialogHeader>
              <DialogTitle>New Appointment</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Select
                  value={newApt.patientId}
                  onValueChange={(patientId) =>
                    setNewApt((prev) => ({ ...prev, patientId }))
                  }
                >
                  {({ open, setOpen }) => (
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
                            selected={patient.id === newApt.patientId}
                            onSelect={() => {
                              setNewApt((prev) => ({
                                ...prev,
                                patientId: patient.id,
                              }));
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
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddAppointment}
                disabled={
                  saving ||
                  !newApt.patientId ||
                  !newApt.date ||
                  !newApt.time
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
                  {rescheduleTarget.patient_name} — currently {rescheduleTarget.date} at{" "}
                  {rescheduleTarget.time}
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
                      setRescheduleForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>New Time</Label>
                  <Input
                    type="time"
                    value={rescheduleForm.time}
                    onChange={(e) =>
                      setRescheduleForm((prev) => ({ ...prev, time: e.target.value }))
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
      </div>
    </>
  );
}
