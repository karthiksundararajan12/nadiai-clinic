"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ArrowRight, Users } from "lucide-react";
import Link from "next/link";

function formatActivityDate(value) {
  if (!value) return "Activity unavailable";
  return `Updated ${new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  })}`;
}

export function RecentPatients({ patients = [], loading = false }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-display">Recent Patients</CardTitle>
        <Link
          href="/patients"
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            Loading patients…
          </p>
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No patients found"
            description="Patient records will appear here after onboarding"
            className="py-10"
          />
        ) : (
          <div className="divide-y divide-border">
            {patients.map((patient) => (
              <div
                key={patient.id}
                className="flex items-center gap-3 px-6 py-3 transition-colors duration-150 hover:bg-muted/60"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="text-xs">
                    {patient.name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {patient.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {formatActivityDate(patient.lastActivityAt)}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={patient.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
