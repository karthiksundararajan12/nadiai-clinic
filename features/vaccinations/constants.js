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
 * NOT YET SUBMITTED/APPROVED. Gated by a two-flag check (see isTemplateLive
 * in vaccination-reminder.service.js): sends are logged-only unless BOTH
 * WHATSAPP_TEMPLATES_LIVE=true (global) AND
 * WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE=true (this template only) —
 * the second, template-specific flag exists precisely so that flipping the
 * global flag on for other, already-approved templates (appt_booking_confirmed,
 * appt_invoice, appt_reminder_24h/2h) can never cause this
 * not-yet-approved template to start sending for real. Do not set
 * WHATSAPP_VACCINATION_REMINDER_TEMPLATE_LIVE until this exact template
 * name is confirmed APPROVED in Meta Business Manager — a real send
 * against an unapproved/non-existent template name will be rejected by
 * the Graph API (error 132001).
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
