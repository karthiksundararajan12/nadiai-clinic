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
  Mail,
  Calendar,
  Activity,
  MoreVertical,
  Stethoscope,
} from "lucide-react";

export default function PatientsPage() {
  const { patients, addPatient, deletePatient } = usePatients();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState("grid");
  const [newPatient, setNewPatient] = useState({
    name: "",
    age: "",
    gender: "Male",
    phone: "",
    email: "",
    condition: "",
  });

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.condition.toLowerCase().includes(search.toLowerCase()) ||
      p.phone.includes(search)
  );

  const handleAddPatient = () => {
    if (newPatient.name && newPatient.phone) {
      addPatient(newPatient);
      setNewPatient({
        name: "",
        age: "",
        gender: "Male",
        phone: "",
        email: "",
        condition: "",
      });
      setDialogOpen(false);
    }
  };

  const activeCount = patients.filter((p) => p.status === "active").length;

  return (
    <>
      <Header
        title="Patients"
        subtitle="Manage your patient records and medical history"
      />

      <div className="flex-1 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search patients..."
              className="w-64"
            />
            <Badge variant="secondary" className="hidden sm:flex">
              {filteredPatients.length} patients
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
              onClick={() => setDialogOpen(true)}
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
                <p className="text-2xl font-bold">{patients.length}</p>
                <p className="text-xs text-muted-foreground">Total Patients</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-success/10 p-2">
                <Activity className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-warning/10 p-2">
                <Stethoscope className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {patients.length - activeCount}
                </p>
                <p className="text-xs text-muted-foreground">Need Follow-up</p>
              </div>
            </div>
          </Card>
        </div>

        {filteredPatients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients found"
            description="Try adjusting your search or add a new patient"
            action={
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Add Patient
              </Button>
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
                        <AvatarFallback>
                          {patient.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-semibold">
                          {patient.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {patient.age} yrs &middot; {patient.gender}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={
                        patient.status === "active" ? "success" : "secondary"
                      }
                      className="text-[10px]"
                    >
                      {patient.status}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Stethoscope className="h-3 w-3 text-primary" />
                      <span>{patient.condition}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <span>{patient.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>
                        Last visit:{" "}
                        {new Date(patient.last_visit).toLocaleDateString(
                          "en-IN",
                          {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          }
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <Button variant="outline" size="xs" className="flex-1">
                      View Details
                    </Button>
                    <Button variant="ghost" size="icon-xs">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
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
                    <AvatarFallback>
                      {patient.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {patient.name}
                      </p>
                      <Badge
                        variant={
                          patient.status === "active" ? "success" : "secondary"
                        }
                        className="text-[10px]"
                      >
                        {patient.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {patient.age} yrs &middot; {patient.gender} &middot;{" "}
                      {patient.condition}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {patient.phone}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(patient.last_visit).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <Button variant="outline" size="xs">
                    View
                  </Button>
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
                <Label>Full Name</Label>
                <Input
                  placeholder="Enter patient's full name"
                  value={newPatient.name}
                  onChange={(e) =>
                    setNewPatient((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Age</Label>
                  <Input
                    type="number"
                    placeholder="Age"
                    value={newPatient.age}
                    onChange={(e) =>
                      setNewPatient((prev) => ({
                        ...prev,
                        age: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <div className="flex gap-2">
                    {["Male", "Female", "Other"].map((g) => (
                      <button
                        key={g}
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
                <Label>Phone Number</Label>
                <Input
                  placeholder="+91 XXXXX XXXXX"
                  value={newPatient.phone}
                  onChange={(e) =>
                    setNewPatient((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Email (Optional)</Label>
                <Input
                  type="email"
                  placeholder="patient@email.com"
                  value={newPatient.email}
                  onChange={(e) =>
                    setNewPatient((prev) => ({
                      ...prev,
                      email: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Primary Condition</Label>
                <Input
                  placeholder="e.g., Hypertension, Diabetes"
                  value={newPatient.condition}
                  onChange={(e) =>
                    setNewPatient((prev) => ({
                      ...prev,
                      condition: e.target.value,
                    }))
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
              <Button onClick={handleAddPatient}>Add Patient</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
