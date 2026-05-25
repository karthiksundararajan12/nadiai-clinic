"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DATA = [12, 19, 8, 15, 22, 10, 6];
const MAX = Math.max(...DATA);

export function ActivityChart() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base">Weekly Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end justify-between gap-2 h-40">
          {DATA.map((value, i) => {
            const height = (value / MAX) * 100;
            const isToday = i === new Date().getDay() - 1;
            return (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-2"
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {value}
                </span>
                <div className="w-full max-w-[40px] relative">
                  <div
                    className={`w-full rounded-md transition-all duration-500 ${
                      isToday ? "bg-primary" : "bg-primary/20"
                    }`}
                    style={{ height: `${height}px` }}
                  />
                </div>
                <span
                  className={`text-xs ${
                    isToday
                      ? "font-semibold text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {DAYS[i]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>Total this week: {DATA.reduce((a, b) => a + b, 0)} patients</span>
          <span className="text-success font-medium">+14% vs last week</span>
        </div>
      </CardContent>
    </Card>
  );
}
