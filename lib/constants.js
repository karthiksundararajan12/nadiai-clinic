export const APP_NAME = "Nadi AI";
export const APP_DESCRIPTION = "AI-Powered Clinical Assistant";

export const NAV_ITEMS = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: "LayoutDashboard",
  },
  {
    title: "Scribe",
    href: "/scribe",
    icon: "Mic",
    badge: "AI",
  },
  {
    title: "Appointments",
    href: "/appointments",
    icon: "CalendarDays",
  },
  {
    title: "Patients",
    href: "/patients",
    icon: "Users",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: "Settings",
  },
];

export const SCRIBE_LANGUAGES = [
  { value: "english",  label: "English",  flag: "🇬🇧" },
  { value: "hinglish", label: "Hinglish", flag: "🇮🇳" },
  { value: "hindi",    label: "Hindi",    flag: "🇮🇳" },
];

export const APPOINTMENT_STATUS = {
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
};

export const APPOINTMENT_STATUS_CONFIG = {
  [APPOINTMENT_STATUS.SCHEDULED]: {
    label: "Scheduled",
    variant: "secondary",
    color: "border-border/80 bg-muted/80 text-muted-foreground",
  },
  [APPOINTMENT_STATUS.CONFIRMED]: {
    label: "Confirmed",
    variant: "default",
    color: "border-success/30 bg-success/10 text-success",
  },
  [APPOINTMENT_STATUS.IN_PROGRESS]: {
    label: "In Progress",
    variant: "warning",
    color: "border-warning/30 bg-warning/10 text-warning",
  },
  [APPOINTMENT_STATUS.COMPLETED]: {
    label: "Completed",
    variant: "success",
    color: "border-success/30 bg-success/10 text-success",
  },
  [APPOINTMENT_STATUS.CANCELLED]: {
    label: "Cancelled",
    variant: "destructive",
    color: "border-destructive/30 bg-destructive/10 text-destructive",
  },
  [APPOINTMENT_STATUS.NO_SHOW]: {
    label: "No Show",
    variant: "outline",
    color: "border-border/80 bg-muted/60 text-muted-foreground",
  },
  // Real values written by the booking flow (features/booking/constants.js's
  // APPOINTMENT_STATUS) that aren't covered by this dashboard-authored enum above.
  pending: {
    label: "Pending",
    variant: "secondary",
    color: "border-warning/30 bg-warning/10 text-warning",
  },
  payment_pending: {
    label: "Payment Pending",
    variant: "warning",
    color: "border-warning/40 bg-warning/[0.12] text-warning",
  },
  rescheduled: {
    label: "Rescheduled",
    variant: "secondary",
    color: "border-primary/30 bg-primary/10 text-primary",
  },
  reschedule_requested: {
    label: "Reschedule Requested",
    variant: "secondary",
    color: "border-accent/30 bg-accent/10 text-accent",
  },
};

/** Patient record status pills (Recent Patients, etc.) — same bordered-pill tokens as appointments. */
export const PATIENT_STATUS_CONFIG = {
  active: {
    label: "Active",
    variant: "success",
    color: "border-success/30 bg-success/10 text-success",
  },
  inactive: {
    label: "Inactive",
    variant: "warning",
    color: "border-warning/30 bg-warning/10 text-warning",
  },
};
