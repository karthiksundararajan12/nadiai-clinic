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
    color: "text-slate-600 bg-slate-100",
  },
  [APPOINTMENT_STATUS.CONFIRMED]: {
    label: "Confirmed",
    variant: "default",
    color: "text-primary bg-primary/10",
  },
  [APPOINTMENT_STATUS.IN_PROGRESS]: {
    label: "In Progress",
    variant: "warning",
    color: "text-amber-700 bg-amber-50",
  },
  [APPOINTMENT_STATUS.COMPLETED]: {
    label: "Completed",
    variant: "success",
    color: "text-emerald-700 bg-emerald-50",
  },
  [APPOINTMENT_STATUS.CANCELLED]: {
    label: "Cancelled",
    variant: "destructive",
    color: "text-red-700 bg-red-50",
  },
  [APPOINTMENT_STATUS.NO_SHOW]: {
    label: "No Show",
    variant: "outline",
    color: "text-gray-500 bg-gray-100",
  },
  // Real values written by the booking flow (features/booking/constants.js's
  // APPOINTMENT_STATUS) that aren't covered by this dashboard-authored enum above.
  pending: {
    label: "Pending",
    variant: "secondary",
    color: "text-zinc-600 bg-zinc-100",
  },
  payment_pending: {
    label: "Payment Pending",
    variant: "warning",
    color: "text-amber-700 bg-amber-100",
  },
  rescheduled: {
    label: "Rescheduled",
    variant: "secondary",
    color: "text-blue-700 bg-blue-50",
  },
  reschedule_requested: {
    label: "Reschedule Requested",
    variant: "secondary",
    color: "text-indigo-700 bg-indigo-50",
  },
};
