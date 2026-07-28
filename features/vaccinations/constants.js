/**
 * @fileoverview Vaccination reminders domain constants (migration 030).
 */

/** @enum {string} public.vaccination_schedules.status */
export const VACCINATION_STATUS = Object.freeze({
  PENDING: "pending",
  REMINDER_SENT: "reminder_sent",
  COMPLETED: "completed",
  OVERDUE: "overdue",
});

export const VACCINATION_STATUS_LABEL = Object.freeze({
  [VACCINATION_STATUS.PENDING]: "Pending",
  [VACCINATION_STATUS.REMINDER_SENT]: "Reminder sent",
  [VACCINATION_STATUS.COMPLETED]: "Completed",
  [VACCINATION_STATUS.OVERDUE]: "Overdue",
});

/** How many days before due_date the reminder cron starts sending. */
export const VACCINATION_REMINDER_LEAD_DAYS = 3;

/**
 * Meta WhatsApp UTILITY template for vaccination due-date reminders —
 * NOT YET SUBMITTED/APPROVED. Same gating pattern as
 * ReminderService's REMINDER_TEMPLATE_NAME and sendInvoiceDocument before
 * appt_invoice was approved: sends are logged-only (see
 * sendVaccinationReminder in vaccination-reminder.service.js) unless
 * WHATSAPP_TEMPLATES_LIVE=true AND this exact template name is confirmed
 * APPROVED in Meta Business Manager. Do not flip that env var for this
 * template before then — a real send against an unapproved/non-existent
 * template name will be rejected by the Graph API.
 */
export const VACCINATION_REMINDER_TEMPLATE_NAME = "vaccination_reminder";

/** Meta template language code for VACCINATION_REMINDER_TEMPLATE_NAME. */
export const VACCINATION_REMINDER_TEMPLATE_LANGUAGE_CODE = "en";

/**
 * Proposed static body for the `vaccination_reminder` template (pending
 * Meta submission/approval) — docs + regression-test reference only, not
 * yet the real approved copy. Params in order: patient full_name,
 * vaccine_name, formatted due date (e.g. "3 Aug 2026").
 */
export const VACCINATION_REMINDER_TEMPLATE_BODY =
  "Hi {{1}}, this is a reminder that the {{2}} vaccination is due on {{3}}. Please contact us to schedule.";
