"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { CalendarDays } from "lucide-react";

export function ActivityChart({ activity = [], loading = false }) {
  const total = activity.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(...activity.map((day) => day.count), 1);

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-display">Weekly Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Loading activity…
          </p>
        ) : total === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No appointment activity"
            description="No appointments were recorded in the past seven days"
            className="py-8"
          />
        ) : (
          <>
            <div className="flex items-end justify-between gap-2 h-40">
              {activity.map((day) => {
                const height = (day.count / max) * 100;
                return (
                  <div
                    key={day.date}
                    className="flex flex-1 flex-col items-center gap-2"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {day.count}
                    </span>
                    <div className="w-full max-w-[40px] relative">
                      <div
                        className={`w-full rounded-md transition-all duration-300 ${
                          day.isToday ? "bg-primary" : "bg-primary/15"
                        }`}
                        style={{ height: `${height}px` }}
                      />
                    </div>
                    <span
                      className={`text-xs ${
                        day.isToday
                          ? "font-semibold text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 text-xs text-muted-foreground">
              Past seven days: {total} appointment{total === 1 ? "" : "s"}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
