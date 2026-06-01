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
    title: "WhatsApp Bot",
    href: "/whatsapp",
    icon: "MessageCircle",
    badge: "Bot",
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
};

export const WHATSAPP_TEMPLATES = [
  {
    id: "appointment_reminder",
    name: "Appointment Reminder",
    message:
      "Namaste {patient_name}! Aapka appointment Dr. {doctor_name} ke saath {date} ko {time} par hai. Please confirm karne ke liye 1 reply karein.",
  },
  {
    id: "appointment_confirmation",
    name: "Booking Confirmation",
    message:
      "Hi {patient_name}! Aapka appointment successfully book ho gaya hai {date} ko {time} par. Appointment ID: {appointment_id}",
  },
  {
    id: "follow_up",
    name: "Follow-up Reminder",
    message:
      "Namaste {patient_name}, aapka follow-up appointment due hai. Kya aap {date} ko available hain? Book karne ke liye YES reply karein.",
  },
  {
    id: "prescription_ready",
    name: "Prescription Ready",
    message:
      "Hi {patient_name}, aapki prescription ready hai. Aap clinic se collect kar sakte hain ya hum WhatsApp par bhej sakte hain. Reply with SEND for WhatsApp delivery.",
  },
];
