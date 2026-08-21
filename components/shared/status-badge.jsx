import { cn } from "@/lib/utils";
import {
  APPOINTMENT_STATUS_CONFIG,
  PATIENT_STATUS_CONFIG,
} from "@/lib/constants";

export const STATUS_PILL_BASE =
  "inline-flex items-center rounded-full border px-3 py-1 text-caption font-medium";

export function StatusBadge({ status, className }) {
  const config =
    APPOINTMENT_STATUS_CONFIG[status] ?? PATIENT_STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span className={cn(STATUS_PILL_BASE, config.color, className)}>
      {config.label}
    </span>
  );
}
