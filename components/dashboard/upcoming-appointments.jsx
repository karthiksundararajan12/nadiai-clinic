"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Clock, ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";

const UPCOMING = [
  {
    patient: "Rajesh Kumar",
    time: "09:00 AM",
    type: "Follow-up",
    status: "confirmed",
    source: "whatsapp",
  },
  {
    patient: "Priya Sharma",
    time: "09:30 AM",
    type: "Consultation",
    status: "scheduled",
    source: "direct",
  },
  {
    patient: "Amit Patel",
    time: "10:00 AM",
    type: "Check-up",
    status: "in_progress",
    source: "whatsapp",
  },
  {
    patient: "Vikram Singh",
    time: "11:00 AM",
    type: "Follow-up",
    status: "scheduled",
    source: "direct",
  },
];

export function UpcomingAppointments() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base">Today&apos;s Appointments</CardTitle>
        <Link
          href="/appointments"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {UPCOMING.map((apt, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/5 text-primary">
                <Clock className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground truncate">
                    {apt.patient}
                  </p>
                  {apt.source === "whatsapp" && (
                    <MessageCircle className="h-3 w-3 text-green-500" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {apt.time} &middot; {apt.type}
                </p>
              </div>
              <StatusBadge status={apt.status} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
