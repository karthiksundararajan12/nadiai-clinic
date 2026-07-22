"use client";

import { useState } from "react";
import { Header } from "@/components/layout/header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SearchInput } from "@/components/shared/search-input";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePatients } from "@/hooks/use-patients";
import {
  Plus,
  Users,
  Phone,
  Calendar,
  CalendarClock,
  Loader2,
} from "lucide-react";

function patientInitials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
}

function formatVisitDate(isoValue) {
  if (!isoValue) return "No visits yet";
  return new Date(isoValue).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatGenderAge(patient) {
  const parts = [];
  if (patient.age != null) parts.push(`${patient.age} yrs`);
  if (patient.gender) parts.push(patient.gender);
  return parts.length > 0 ? parts.join(" · ") : "Details not recorded";
}

export default function PatientsPage() {
  const { patients, stats, loading, error, addPatient } = usePatients();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [newPatient, setNewPatient] = useState({
    name: "",
    age: "",
    gender: "Male",
    phone: "",
  });

  const filteredPatients = patients.filter((patient) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      patient.name.toLowerCase().includes(query) ||
      patient.phone.replace(/\s+/g, "").includes(query.replace(/\s+/g, ""))
    );
  });

  const handleAddPatient = async () => {
    setSaveError("");
    setSaving(true);
    try {
      await addPatient(newPatient);
      setNewPatient({
        name: "",
        age: "",
        gender: "Male",
        phone: "",
      });
      setDialogOpen(false);
    } catch (saveErr) {
      setSaveError(saveErr.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Header
        title="Patients"
        subtitle="Manage your clinic's patient records"
      />

      <div className="flex-1 p-6 space-y-6">
        {(error || saveError) && (
          <p className="text-sm text-destructive">{saveError || error?.message}</p>
        )}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search by name or phone..."
              className="w-64"
            />
            <Badge variant="secondary" className="hidden sm:flex">
              {loading ? "Loading…" : `${filteredPatients.length} patients`}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                Grid
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                List
              </button>
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setSaveError("");
                setDialogOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Patient
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loading ? "—" : stats.totalPatients}
                </p>
                <p className="text-xs text-muted-foreground">Total Patients</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2">
                <CalendarClock className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loading ? "—" : stats.withUpcomingVisit}
                </p>
                <p className="text-xs text-muted-foreground">Upcoming Visits</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg border border-gray-200 bg-white p-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {loading ? "—" : stats.noAppointmentsYet}
                </p>
                <p className="text-xs text-muted-foreground">No Appointments Yet</p>
              </div>
            </div>
          </Card>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading patients…
          </div>
        ) : filteredPatients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={patients.length === 0 ? "No patients yet" : "No patients found"}
            description={
              patients.length === 0
                ? "Add your first patient or wait for bookings to create records automatically."
                : "Try adjusting your search."
            }
            action={
              patients.length === 0 ? (
                <Button size="sm" onClick={() => setDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Patient
                </Button>
              ) : null
            }
          />
        ) : viewMode === "grid" ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredPatients.map((patient) => (
              <Card
                key={patient.id}
                className="group transition-shadow hover:shadow-md"
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-11 w-11">
                        <AvatarFallback>{patientInitials(patient.name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold">{patient.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatGenderAge(patient)}
                        </p>
                      </div>
                    </div>
                    {patient.upcomingVisit && (
                      <Badge variant="success" className="text-[10px]">
                        Upcoming
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{patient.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>Last visit: {formatVisitDate(patient.lastVisit)}</span>
                    </div>
                    {patient.upcomingVisit && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarClock className="h-3 w-3" />
                        <span>
                          Next visit: {formatVisitDate(patient.upcomingVisit)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {filteredPatients.map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center gap-4 p-4 transition-colors hover:bg-muted/50"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{patientInitials(patient.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{patient.name}</p>
                      {patient.upcomingVisit && (
                        <Badge variant="success" className="text-[10px]">
                          Upcoming
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatGenderAge(patient)}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {patient.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatVisitDate(patient.lastVisit)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

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
      </div>
    </>
  );
}
