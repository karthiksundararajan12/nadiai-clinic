"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { usePatients } from "@/hooks/use-patients";
import { cn } from "@/lib/utils";
import { IAP_VACCINE_NAMES } from "@/lib/iap-schedule";

function todayDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function NewVaccinationPage() {
  const router = useRouter();
  const { patients, loading: patientsLoading } = usePatients();
  const [patientId, setPatientId] = useState("");
  const [vaccineName, setVaccineName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const minDate = useMemo(() => todayDateKey(), []);
  const selectedPatientName = patients.find((p) => p.id === patientId)?.name ?? "";

  const canSubmit = Boolean(patientId) && vaccineName.trim().length > 0 && Boolean(dueDate) && !saving;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/vaccinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId, vaccineName: vaccineName.trim(), dueDate }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to add vaccination reminder");
      }
      router.push("/vaccinations");
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Header
        title="Add vaccination reminder"
        subtitle="Manually schedule a vaccination due date for a patient"
      />

      <div className="flex-1 space-y-4 p-6">
        <Link
          href="/vaccinations"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to vaccinations
        </Link>

        <Card className="max-w-xl p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="space-y-2">
              <Label htmlFor="vaccination-patient">Patient</Label>
              <Select value={patientId} onValueChange={setPatientId}>
                {({ open, setOpen, value, onValueChange }) => (
                  <>
                    <SelectTrigger
                      id="vaccination-patient"
                      open={open}
                      onClick={() => setOpen(!open)}
                      disabled={patientsLoading}
                    >
                      {selectedPatientName || (patientsLoading ? "Loading patients…" : "Select a patient")}
                    </SelectTrigger>
                    <SelectContent open={open} className="max-h-64 overflow-y-auto">
                      {patients.length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                          No patients yet — add a patient first.
                        </p>
                      ) : (
                        patients.map((patient) => (
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
                            {patient.phone ? ` · ${patient.phone}` : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </>
                )}
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="vaccination-name">Vaccine name</Label>
              <Combobox
                id="vaccination-name"
                placeholder="e.g. MMR - 2 or a custom entry"
                value={vaccineName}
                onValueChange={setVaccineName}
                options={IAP_VACCINE_NAMES}
                disabled={saving}
                emptyMessage="No IAP vaccine matches — this will be saved as a custom entry."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vaccination-due-date">Due date</Label>
              <Input
                id="vaccination-due-date"
                type="date"
                min={minDate}
                value={dueDate}
                disabled={saving}
                onChange={(e) => setDueDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A WhatsApp reminder is sent automatically starting 3 days before this date.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" disabled={!canSubmit}>
                {saving ? "Saving…" : "Add vaccination reminder"}
              </Button>
              <Link
                href="/vaccinations"
                className={cn(buttonVariants({ variant: "outline" }))}
              >
                Cancel
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
}
