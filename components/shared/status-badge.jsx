import { cn } from "@/lib/utils";
import { APPOINTMENT_STATUS_CONFIG } from "@/lib/constants";

export function StatusBadge({ status, className }) {
  const config = APPOINTMENT_STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        config.color,
        className
      )}
    >
      {config.label}
    </span>
  );
}
