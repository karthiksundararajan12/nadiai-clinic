/**
 * @fileoverview Client-safe public API for the booking feature.
 *
 * Safe to import from Client Components. Must never re-export Node-only
 * modules (invoice-pdf, createBookingServices, repositories, etc.).
 *
 * Usage:
 *   import { APPOINTMENT_STATUS, bookingLogger } from "@/features/booking/client";
 *   // or via the barrel: import { ... } from "@/features/booking";
 */

// ─────────────────────────────────────────────────────────────
// CLIENT-SAFE DOMAIN EXPORTS
// ─────────────────────────────────────────────────────────────

export {
  CONVERSATION_STATE,
  VALID_CONVERSATION_TRANSITIONS,
  CONVERSATION_EXPIRY_HOURS,
  START_MENU_RETRY_LIMIT,
  START_MENU_INTENT,
  START_MENU_ROWS,
  START_MENU_COPY,
  HANDOFF_REASON,
  HANDOFF_NOTIFICATION_COPY,
  COLLECTING_PATIENT_STEP,
  COLLECTING_PATIENT_COPY,
  SHARED_BOOKING_COPY,
  PATIENT_SELECTION_ADD_NEW_ID,
  PATIENT_SELECTION_ROW_ID_PREFIX,
  CONSENT_INTENT,
  DUPLICATE_MATCH_INTENT,
  PATIENT_NAME_FUZZY_MATCH_THRESHOLD,
  CANCEL_KEYWORD,
  RESET_KEYWORDS,
  CANCEL_KEYWORDS,
  RESET_CONFIRM_INTENT,
  CANCEL_CONFIRM_INTENT,
  RESET_COPY,
  CANCEL_COPY,
  PATIENT_REQUESTED_CANCELLATION_REASON,
  PATIENT_NO_SHOW_CANCELLATION_REASON,
  DOCTOR_CANCELLED_DASHBOARD_REASON,
  PATIENT_CANCELLED_MENU_REASON,
  CONFIRMED_INBOUND_COPY,
  CONFIRMED_INBOUND_FALLBACK_STATES,
  APPOINTMENT_STATUS,
  PAYMENT_REQUIRED_MIN_FEE,
  SLOT_SELECTION_STEP,
  SLOT_SELECTION_COPY,
  PAYMENT_WEBHOOK_COPY,
  BOOKING_CONFIRMED_TEMPLATE_NAME,
  BOOKING_CONFIRMED_TEMPLATE_BODY,
  BOOKING_CONFIRMED_TEMPLATE_LANGUAGE_CODE,
  INVOICE_WHATSAPP_TEMPLATE_NAME,
  INVOICE_WHATSAPP_TEMPLATE_BODY,
  INVOICE_WHATSAPP_TEMPLATE_LANGUAGE_CODE,
  INVOICE_STORAGE,
  SLOT_ROW_ID_PREFIX,
  OVERLAP_CONFIRM_INTENT,
  SLOT_TIMEZONE_OFFSET,
  SLOT_SEARCH_DAYS_AHEAD,
  SLOT_MIN_LEAD_MINUTES,
  SLOT_DEFAULT_CONSULTATION_DURATION_MINUTES,
  SLOT_DEFAULT_WORKING_HOURS_START,
  SLOT_DEFAULT_WORKING_HOURS_END,
  SLOT_HOLD_DURATION_MINUTES,
  SLOT_LIST_MAX_OPTIONS,
  SLOT_LIST_MORE_ROW_ID,
  RAZORPAY_EVENT_TYPE,
  REFUND_STATUS,
  CAPTURED_PAYMENT_STATUSES,
  INBOUND_MESSAGE_TYPE,
  WHATSAPP_CONFIG,
  REMINDER_KIND,
  REMINDER_SENT_AT_COLUMN,
  REMINDER_OFFSET_COLUMN,
  REMINDER_DEFAULT_OFFSET_MINUTES,
  REMINDER_WINDOW_MINUTES,
  REMINDER_TEMPLATE_NAME,
  REMINDER_TEMPLATE_LANGUAGE_CODE,
  REMINDER_REPLY_ACTION,
  REMINDER_REPLY_ID_PREFIX,
  REMINDER_COPY,
} from "./constants.js";

export {
  BookingError,
  WebhookSignatureError,
  WebhookVerificationError,
  RazorpayWebhookSignatureError,
  ClinicNotFoundError,
  InvalidConversationTransitionError,
  WhatsAppSendError,
  WhatsAppCredentialsError,
  RazorpayCredentialsError,
  RazorpaySendError,
  RefundRetryError,
  MissingConsultationFeeError,
  WorkerUnauthorizedError,
  DatabaseError,
  isBookingError,
  toApiError,
} from "./errors.js";

export { NormalizedInboundMessageSchema } from "./schemas.js";

export { createLogger, bookingLogger } from "./logger.js";

export { canTransitionConversation, assertValidConversationTransition } from "./lib/conversation-transitions.js";
export { isConversationExpired } from "./lib/conversation-expiry.js";
export { normalizePhoneForWhatsApp, formatPhoneForDisplay } from "./lib/phone.js";
export { describeInboundMessageForHandoff, describeContactForHandoff } from "./lib/handoff-summary.js";
export { levenshteinDistance, nameSimilarity, findClosestPatientMatch } from "./lib/fuzzy-match.js";
export { validatePatientName, parseAgeOrDob } from "./lib/patient-input.js";
export { buildPatientSelectionRows, patientOptionRowId, parsePatientOptionRowId } from "./lib/patient-list.js";
export {
  buildMenuAppointmentSelectionRows,
  menuAppointmentRowId,
  parseMenuAppointmentRowId,
} from "./lib/menu-appointment-list.js";
export {
  normalizeWorkingHours,
  generateCandidateSlots,
  formatSlotLabel,
  formatSlotDateTimeParts,
  slotRowId,
  parseSlotRowId,
} from "./lib/slot-engine.js";
export { resolveConsultationFee } from "./lib/consultation-fee.js";
export { isBlockingAppointmentRow } from "./lib/appointment-availability.js";
export { reminderReplyId, parseReminderReplyId } from "./lib/reminder-reply.js";
export {
  PAYMENT_STATUS_FILTER,
  PAYMENT_STATUS_LABEL,
  formatPaymentStatusLabel,
  paymentStatusFilterToDb,
  resolvePaymentDateRange,
  escapeIlikePattern,
} from "./lib/payment-list.js";
export {
  APPOINTMENT_STATUS_FILTER,
  APPOINTMENT_STATUS_LABEL,
  REFUND_STATUS_LABEL,
  formatAppointmentStatusLabel,
  appointmentStatusFilterToDb,
  formatRefundStatusLabel,
  resolveAppointmentSlotDateRange,
} from "./lib/appointment-list.js";
