"use client";

import { Header } from "@/components/layout/header";
import { StatsCard } from "@/components/dashboard/stats-card";
import { RecentPatients } from "@/components/dashboard/recent-patients";
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  CalendarDays,
  Mic,
  MessageCircle,
  TrendingUp,
  Clock,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const today = new Date();
  const greeting =
    today.getHours() < 12
      ? "Good Morning"
      : today.getHours() < 17
      ? "Good Afternoon"
      : "Good Evening";

  return (
    <>
      <Header
        title={`${greeting}, Dr. Ananya`}
        subtitle={today.toLocaleDateString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      />

      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Patients"
            value="1,247"
            change="12%"
            changeType="positive"
            icon={Users}
          />
          <StatsCard
            title="Today's Appointments"
            value="18"
            change="3"
            changeType="positive"
            icon={CalendarDays}
          />
          <StatsCard
            title="Scribe Sessions"
            value="34"
            change="8%"
            changeType="positive"
            icon={Mic}
          />
          <StatsCard
            title="WhatsApp Bookings"
            value="156"
            change="23%"
            changeType="positive"
            icon={MessageCircle}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            <UpcomingAppointments />
            <ActivityChart />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <RecentPatients />

            <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-foreground">
                      AI Scribe Ready
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Start a new consultation with Hinglish voice transcription
                      and auto-generated clinical notes.
                    </p>
                    <Link href="/scribe">
                      <Button size="sm" className="mt-3 gap-1.5">
                        <Mic className="h-3.5 w-3.5" />
                        Start Scribe
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Link href="/scribe">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-center transition-colors hover:bg-muted">
                    <Mic className="h-5 w-5 text-primary" />
                    <span className="text-xs font-medium">New Scribe</span>
                  </button>
                </Link>
                <Link href="/appointments">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-center transition-colors hover:bg-muted">
                    <CalendarDays className="h-5 w-5 text-primary" />
                    <span className="text-xs font-medium">Book Slot</span>
                  </button>
                </Link>
                <Link href="/patients">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-center transition-colors hover:bg-muted">
                    <Users className="h-5 w-5 text-primary" />
                    <span className="text-xs font-medium">Add Patient</span>
                  </button>
                </Link>
                <Link href="/whatsapp">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-center transition-colors hover:bg-muted">
                    <MessageCircle className="h-5 w-5 text-green-600" />
                    <span className="text-xs font-medium">WhatsApp</span>
                  </button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
