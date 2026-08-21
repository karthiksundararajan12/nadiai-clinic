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
    title: "Payments",
    href: "/payments",
    icon: "CreditCard",
  },
  {
    title: "Patients",
    href: "/patients",
    icon: "Users",
  },
  {
    title: "Vaccinations",
    href: "/vaccinations",
    icon: "Syringe",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: "Settings",
  },
];

export const SCRIBE_LANGUAGES = [
  { value: "english",  label: "English",  shortLabel: "EN" },
  { value: "hinglish", label: "Hinglish", shortLabel: "HI+" },
  { value: "hindi",    label: "Hindi",    shortLabel: "HI" },
];

export const APPOINTMENT_STATUS = {
  SCHEDULED: "scheduled",
  CONFIRMED: "confirmed",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  NO_SHOW: "no_show",
};

const STATUS_PILL = {
  confirmed:
    "border-status-confirmed-border bg-status-confirmed-bg text-status-confirmed",
  cancelled:
    "border-status-cancelled-border bg-status-cancelled-bg text-status-cancelled",
  pending:
    "border-status-pending-border bg-status-pending-bg text-status-pending",
  completed:
    "border-status-completed-border bg-status-completed-bg text-status-completed",
};

export const APPOINTMENT_STATUS_CONFIG = {
  [APPOINTMENT_STATUS.SCHEDULED]: {
    label: "Scheduled",
    variant: "secondary",
    color: STATUS_PILL.completed,
  },
  [APPOINTMENT_STATUS.CONFIRMED]: {
    label: "Confirmed",
    variant: "default",
    color: STATUS_PILL.confirmed,
  },
  [APPOINTMENT_STATUS.IN_PROGRESS]: {
    label: "In Progress",
    variant: "warning",
    color: STATUS_PILL.pending,
  },
  [APPOINTMENT_STATUS.COMPLETED]: {
    label: "Completed",
    variant: "success",
    color: STATUS_PILL.completed,
  },
  [APPOINTMENT_STATUS.CANCELLED]: {
    label: "Cancelled",
    variant: "destructive",
    color: STATUS_PILL.cancelled,
  },
  [APPOINTMENT_STATUS.NO_SHOW]: {
    label: "No Show",
    variant: "outline",
    color: STATUS_PILL.completed,
  },
  // Real values written by the booking flow (features/booking/constants.js's
  // APPOINTMENT_STATUS) that aren't covered by this dashboard-authored enum above.
  pending: {
    label: "Pending",
    variant: "secondary",
    color: STATUS_PILL.pending,
  },
  payment_pending: {
    label: "Payment Pending",
    variant: "warning",
    color: `${STATUS_PILL.pending} font-semibold`,
  },
  rescheduled: {
    label: "Rescheduled",
    variant: "secondary",
    color: "border-primary/20 bg-primary-soft text-primary",
  },
  reschedule_requested: {
    label: "Reschedule Requested",
    variant: "secondary",
    color: "border-status-pending-border bg-primary-soft text-status-pending",
  },
};

/** Patient record status pills (Recent Patients, etc.) — same bordered-pill tokens as appointments. */
export const PATIENT_STATUS_CONFIG = {
  active: {
    label: "Active",
    variant: "success",
    color: STATUS_PILL.confirmed,
  },
  inactive: {
    label: "Inactive",
    variant: "warning",
    color: STATUS_PILL.completed,
  },
};
