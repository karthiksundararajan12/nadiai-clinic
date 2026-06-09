"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { useAppointments } from "@/hooks/use-appointments";
import {
  Plus,
  CalendarDays,
  Clock,
  User,
  Filter,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function AppointmentsPage() {
  const { appointments, addAppointment, updateAppointment, cancelAppointment } =
    useAppointments();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [newApt, setNewApt] = useState({
    patient_name: "",
    date: "",
    time: "",
    type: "Consultation",
    notes: "",
    source: "direct",
  });

  const filteredAppointments = appointments.filter(
    (a) =>
      a.patient_name.toLowerCase().includes(search.toLowerCase()) ||
      a.type.toLowerCase().includes(search.toLowerCase())
  );

  const todayApts = filteredAppointments.filter(
    (a) => a.date === new Date().toISOString().split("T")[0]
  );
  const upcomingApts = filteredAppointments.filter(
    (a) => a.date > new Date().toISOString().split("T")[0]
  );
  const pastApts = filteredAppointments.filter(
    (a) => a.date < new Date().toISOString().split("T")[0]
  );

  const handleAddAppointment = () => {
    if (newApt.patient_name && newApt.date && newApt.time) {
      addAppointment({ ...newApt, doctor: "Dr. Ananya Mehta" });
      setNewApt({
        patient_name: "",
        date: "",
        time: "",
        type: "Consultation",
        notes: "",
        source: "direct",
      });
      setDialogOpen(false);
    }
  };

  function AppointmentList({ items }) {
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
        {items.map((apt) => (
          <div
            key={apt.id}
            className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/5 text-primary">
              <span className="text-xs font-semibold">
                {new Date(apt.date).toLocaleDateString("en-IN", {
                  day: "2-digit",
                })}
              </span>
              <span className="text-[10px] uppercase">
                {new Date(apt.date).toLocaleDateString("en-IN", {
                  month: "short",
                })}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">
                  {apt.patient_name}
                </p>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {apt.time}
                </span>
                <span>{apt.type}</span>
                <span>{apt.duration} min</span>
              </div>
              {apt.notes && (
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {apt.notes}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge status={apt.status} />
              {(apt.status === "scheduled" || apt.status === "confirmed") && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-destructive"
                  onClick={() => cancelAppointment(apt.id)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <Header
        title="Appointments"
        subtitle="Manage and track all your patient appointments"
      />

      <div className="flex-1 p-6 space-y-6">
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
                <p className="text-2xl font-bold">{todayApts.length}</p>
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
                <p className="text-2xl font-bold">{upcomingApts.length}</p>
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
                <p className="text-2xl font-bold">{pastApts.length}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
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
                <AppointmentList items={todayApts} />
              </TabsContent>
              <TabsContent value="upcoming">
                <AppointmentList items={upcomingApts} />
              </TabsContent>
              <TabsContent value="past">
                <AppointmentList items={pastApts} />
              </TabsContent>
              <TabsContent value="all">
                <AppointmentList items={filteredAppointments} />
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
                <Label>Patient Name</Label>
                <Input
                  placeholder="Enter patient name"
                  value={newApt.patient_name}
                  onChange={(e) =>
                    setNewApt((prev) => ({
                      ...prev,
                      patient_name: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
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
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex gap-2">
                  {["Consultation", "Follow-up", "Check-up", "Emergency"].map(
                    (type) => (
                      <button
                        key={type}
                        onClick={() =>
                          setNewApt((prev) => ({ ...prev, type }))
                        }
                        className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          newApt.type === type
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {type}
                      </button>
                    )
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  placeholder="Optional notes"
                  value={newApt.notes}
                  onChange={(e) =>
                    setNewApt((prev) => ({ ...prev, notes: e.target.value }))
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddAppointment}>Book Appointment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
