"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Clock, ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import { ICON_SIZE_MD, ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";

export function UpcomingAppointments({ appointments = [], loading = false }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base font-display">Today&apos;s Appointments</CardTitle>
        <Link
          href="/appointments"
          className="flex items-center gap-1 text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80"
        >
          View all <ArrowRight className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            Loading appointments…
          </p>
        ) : appointments.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointments found"
            description="There are no appointments scheduled for today"
            className="py-10"
          />
        ) : (
          <div className="divide-y divide-border">
            {appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-center gap-3 px-6 py-3 transition-colors duration-150 hover:bg-muted/60"
              >
                <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border border-primary/15 bg-primary/10 text-primary">
                  <Clock className={ICON_SIZE_MD} strokeWidth={ICON_STROKE} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {apt.patientName}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {apt.time}
                    {apt.type ? ` · ${apt.type}` : ""}
                  </p>
                </div>
                <StatusBadge status={apt.status} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
