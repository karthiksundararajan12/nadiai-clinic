"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/header";
import { StatsCard } from "@/components/dashboard/stats-card";
import { RecentPatients } from "@/components/dashboard/recent-patients";
import { UpcomingAppointments } from "@/components/dashboard/upcoming-appointments";
import { ActivityChart } from "@/components/dashboard/activity-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/use-user";
import { useDashboardData } from "@/hooks/use-dashboard-data";
import {
  Users,
  CalendarDays,
  Mic,
  ArrowRight,
  Activity,
  Stethoscope,
  CreditCard,
} from "lucide-react";
import { ICON_SIZE_LG, ICON_SIZE_SM, ICON_STROKE } from "@/lib/icons";
import Link from "next/link";

export default function DashboardPage() {
  const { displayName } = useUser();
  const { data: dashboard, loading, error } = useDashboardData();
  const [dateStr, setDateStr] = useState("");
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hour = now.getHours();
      setGreeting(
        hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening"
      );
      setDateStr(
        now.toLocaleDateString("en-IN", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      );
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  const firstName = displayName?.split(" ")[0] || "Doctor";
  const metricValue = (value) => {
    if (loading) return "—";
    if (!value) return "No data";
    return value.toLocaleString("en-IN");
  };

  return (
    <>
      <Header
        title={`${greeting}, ${firstName}`}
        subtitle={dateStr}
      />

      <div className="flex-1 space-y-6 p-6">
        {error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Dashboard data could not be loaded. Please refresh to try again.
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Patients"
            value={metricValue(dashboard?.stats.totalPatients)}
            icon={Users}
          />
          <StatsCard
            title="Today's Appointments"
            value={metricValue(dashboard?.stats.todayAppointments)}
            icon={CalendarDays}
          />
          <StatsCard
            title="Scribe Sessions This Week"
            value={metricValue(dashboard?.stats.completedScribeSessionsThisWeek)}
            icon={Stethoscope}
          />
          <StatsCard
            title="Active Patients"
            value={metricValue(dashboard?.stats.activePatients)}
            icon={Activity}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-6">
            <UpcomingAppointments
              appointments={dashboard?.todayAppointments}
              loading={loading}
            />
            <ActivityChart
              activity={dashboard?.weeklyActivity}
              loading={loading}
            />
          </div>

          <div className="lg:col-span-2 space-y-6">
            <RecentPatients
              patients={dashboard?.recentPatients}
              loading={loading}
            />

            <Card className="border border-primary/15 bg-gradient-to-br from-primary/5 via-card to-card">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg border border-primary/15 bg-primary/10 p-2 text-primary">
                    <Mic className={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-sm font-semibold text-foreground">
                      AI Scribe Ready
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Start a new consultation with Hinglish voice transcription
                      and auto-generated clinical notes.
                    </p>
                    <Link href="/scribe">
                      <Button size="sm" className="mt-3 gap-1.5">
                        <Mic className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                        Start Scribe
                        <ArrowRight className={ICON_SIZE_SM} strokeWidth={ICON_STROKE} />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-display">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <Link href="/scribe">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center text-primary transition-colors duration-150 hover:border-primary/20 hover:bg-muted/50">
                    <Mic className={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
                    <span className="text-xs font-medium text-foreground">New Scribe</span>
                  </button>
                </Link>
                <Link href="/appointments">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center text-primary transition-colors duration-150 hover:border-primary/20 hover:bg-muted/50">
                    <CalendarDays className={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
                    <span className="text-xs font-medium text-foreground">Book Slot</span>
                  </button>
                </Link>
                <Link href="/patients">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center text-primary transition-colors duration-150 hover:border-primary/20 hover:bg-muted/50">
                    <Users className={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
                    <span className="text-xs font-medium text-foreground">Add Patient</span>
                  </button>
                </Link>
                <Link href="/payments">
                  <button className="flex w-full flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 text-center text-primary transition-colors duration-150 hover:border-primary/20 hover:bg-muted/50">
                    <CreditCard className={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
                    <span className="text-xs font-medium text-foreground">Payments</span>
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
