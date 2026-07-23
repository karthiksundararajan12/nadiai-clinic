import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ICON_SIZE_LG, ICON_STROKE } from "@/lib/icons";

export function StatsCard({ title, value, change, changeType, icon: Icon, className }) {
  return (
    <Card className={cn("p-5 transition-shadow duration-150 hover:shadow-clinical", className)}>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {title}
          </span>
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {value}
          </span>
          {change && (
            <div className="flex items-center gap-1 text-xs">
              <span
                className={cn(
                  "font-medium",
                  changeType === "positive"
                    ? "text-success"
                    : changeType === "negative"
                    ? "text-destructive"
                    : "text-muted-foreground"
                )}
              >
                {changeType === "positive" ? "+" : ""}
                {change}
              </span>
              <span className="text-muted-foreground">vs last week</span>
            </div>
          )}
        </div>
        {Icon && (
          <div className="rounded-lg border border-primary/15 bg-primary/10 p-2.5 text-primary">
            <Icon className={ICON_SIZE_LG} strokeWidth={ICON_STROKE} />
          </div>
        )}
      </div>
    </Card>
  );
}
