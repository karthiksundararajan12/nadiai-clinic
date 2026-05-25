"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

const RECENT = [
  { name: "Rajesh Kumar", condition: "Type 2 Diabetes", time: "2 hours ago", status: "active" },
  { name: "Priya Sharma", condition: "Hypertension", time: "4 hours ago", status: "active" },
  { name: "Amit Patel", condition: "Cardiac Arrhythmia", time: "Yesterday", status: "active" },
  { name: "Sunita Devi", condition: "Osteoarthritis", time: "2 days ago", status: "follow-up" },
];

export function RecentPatients() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <CardTitle className="text-base">Recent Patients</CardTitle>
        <Link
          href="/patients"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y divide-border">
          {RECENT.map((patient, i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
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
                  {patient.condition}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-[11px] text-muted-foreground">
                  {patient.time}
                </span>
                <Badge
                  variant={patient.status === "active" ? "success" : "warning"}
                  className="text-[10px]"
                >
                  {patient.status}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
