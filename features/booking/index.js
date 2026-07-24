/**
 * @fileoverview features/booking — public API barrel.
 *
 * Import from here in all API routes and pages. Never import directly
 * from sub-directories to preserve the feature boundary.
 *
 * Usage:
 *   import { createBookingServices, CONVERSATION_STATE } from "@/features/booking";
 *
 * ── Known scope trade-offs (Session 1 / START state) ──────────────────
 *
 * 1. Idempotency ledger: there is no dedicated inbound-message log table
 *    (the legacy `wa_messages` table in supabase/schema.sql was never
 *    applied to the live DB, and adding a new table requires a schema
 *    change the user has not yet approved). We dedupe by stashing the
 *    last processed `wa_message_id` in `conversation_state.context`
 *    instead. This is sufficient for Meta's near-immediate webhook
 *    retries but is NOT a full historical dedup log — flag this if a
 *    stronger guarantee is needed later.
 *
 * 2. WhatsApp send auth: centralized per earlier project decision ("Meta
 *    auth should happen in Nadi AI, not the doctor's side"). This module
 *    sends via a single platform-level WHATSAPP_ACCESS_TOKEN env var, not
 *    `clinics.whatsapp_access_token_encrypted` (no decryption utility
 *    exists in the codebase yet, and that column may be a legacy/unused
 *    per-clinic-token design predating the centralized-auth decision).
 *
 * 3. RLS on patients/appointments/conversation_state is deferred per user
 *    confirmation — all booking repositories use the service-role client.
 *
 * 4. Webhook processing is synchronous within the route handler (no queue
 *    yet). The route always ACKs Meta with 200 even on internal errors
 *    (logged, not surfaced) to avoid retry storms; a proper async
 *    ingestion layer is future work.
 *
 * 5. HUMAN_HANDOFF doctor notification (all doctor_profiles.phone on the
 *    clinic) reuses the same free-form Meta send as the greeting message,
 *    per user instruction — no new table, no template. This only reliably
 *    delivers if the doctor messaged the clinic's WABA number within the
 *    last 24h (Meta's customer-service-window rule for non-template
 *    sends); a pre-approved template would be needed to guarantee
 *    delivery outside that window. Flagged, not silently assumed to work.
 *
 * ── Session 2 (COLLECTING_PATIENT) additions ───────────────────────────
 *
 * 6. Sub-step progress within COLLECTING_PATIENT lives in
 *    `conversation_state.context.collectingPatientStep` — the top-level
 *    `current_state` column only changes on entry (START ->
 *    COLLECTING_PATIENT) and exit (-> SLOT_SELECTION, or -> START if
 *    consent is declined / the contact cancels).
 *
 * 7. Fuzzy duplicate-name matching is a pure Levenshtein similarity check
 *    (lib/fuzzy-match.js) against this contact's own existing patients
 *    only — never across contacts/clinics — with a configurable threshold
 *    (PATIENT_NAME_FUZZY_MATCH_THRESHOLD).
 *
 * 8. DPDP consent is captured explicitly in this flow (interactive
 *    Yes/No, never inferred from WhatsApp opt-in) and stamped on
 *    `patients.consent_given` / `consent_given_at` — including for an
 *    *existing* patient re-selected here who doesn't already have it on
 *    file.
 *
 * ── Session 3 (SLOT_SELECTION) additions ───────────────────────────────
 *
 * 9. No per-clinic timezone column exists yet. Every clinic is assumed to
 *    run on India Standard Time (fixed UTC+05:30, no DST) — see the
 *    SLOT_TIMEZONE_OFFSET doc comment in constants.js and lib/slot-engine.js.
 *
 * 10. No per-day-of-week or holiday availability config exists yet
 *     (ARCHITECTURE.md open decision #1) — every day uses the same
 *     doctor_profiles.working_hours_start/end. Flagged as a known scope
 *     limitation, not silently assumed to be correct for real clinics.
 *
 * 11. There is no dedicated "payment required" flag on `clinics` or
 *     `doctor_profiles`. Per the booking prompts doc's rule ("if output
 *     diverges from ARCHITECTURE.md's FK structure, stop and flag — do not
 *     let it silently create new columns/tables"), the user was asked which
 *     source of truth to use and did not pick one. SLOT_SELECTION falls
 *     back to `doctor_profiles.consultation_fee > 0` as a documented stand-in
 *     (see PAYMENT_REQUIRED_MIN_FEE in constants.js) — revisit if/when a
 *     dedicated flag is added.
 *
 * 12. Race-condition safety for double-booking relies entirely on the
 *     pre-existing DB-level partial unique index
 *     `appointments_no_double_booking` (doctor_id, slot_start) WHERE status
 *     NOT IN ('cancelled','rescheduled') — confirmed present on the live DB
 *     before this session, not created by this change. AppointmentRepository
 *     never does check-then-insert; it inserts and branches on the
 *     resulting conflict.
 *
 * 13. PAYMENT_PENDING's Razorpay link is a stub only (lib/payment-stub.js)
 *     per spec ("stub the transition and link generation only") — no real
 *     payment integration or webhook exists yet (Session 4).
 *
 * 14. DoctorNotificationService was extracted out of ConversationStateService
 *     in this session since SLOT_SELECTION also triggers HUMAN_HANDOFF (no
 *     doctor configured / no open slots) and needs the same notification
 *     logic — see that file.
 *
 * ── Session 3 refinement (hold-based holds + hardcoded stub fee) ───────
 *
 * 15. `appointments.hold_expires_at` (migration 019) makes a PAYMENT_PENDING
 *     slot reservation expire (default SLOT_HOLD_DURATION_MINUTES) without
 *     a background job — enforced in AppointmentRepository on both the
 *     availability-read path and, via a lazy release-then-insert, the
 *     booking-write path. See that file's header comment for why a plain
 *     partial-index predicate can't express this directly in Postgres.
 *
 * 16. The amount shown/stored for a PAYMENT_PENDING booking
 *     (CONSULT_FEE_PLACEHOLDER_RUPEES) is a hardcoded stub, not a real
 *     `doctor_profiles.consultation_fee` lookup, per explicit instruction —
 *     only *whether* prepayment is required still reads that column (see
 *     PAYMENT_REQUIRED_MIN_FEE).
 *
 * ── Session 4 (Razorpay webhook: PAYMENT_PENDING -> CONFIRMED) ─────────
 *
 * 17. CONSULT_FEE_PLACEHOLDER_RUPEES (note 16) is gone — SlotSelectionService
 *     now resolves the doctor's *real* `consultation_fee` via
 *     lib/consultation-fee.js for both the prepayment decision and the
 *     amount. A missing (null/undefined) fee is treated as a configuration
 *     error (HANDOFF_REASON.MISSING_CONSULTATION_FEE), never silently
 *     defaulted — see that file's header comment.
 *
 * 18. PAYMENT_PENDING now creates a real, payable Razorpay Payment Link
 *     (RazorpayClientService) instead of the Session 3 stub
 *     (lib/payment-stub.js, removed). Requires RAZORPAY_KEY_ID /
 *     RAZORPAY_KEY_SECRET env vars — same fail-fast-on-missing-credentials
 *     pattern as WhatsAppClientService.
 *
 * 19. New endpoint `/api/webhooks/razorpay` (PaymentWebhookService) handles
 *     Razorpay's "payment.captured" / "payment.failed" events. Requires
 *     RAZORPAY_WEBHOOK_SECRET. Idempotency ledger:
 *     `public.razorpay_webhook_events` (migration 020), keyed on the
 *     `X-Razorpay-Event-Id` header — a new table, per explicit instruction
 *     this session (unlike the wa_message_id trade-off in note #1).
 *
 * 20. Correlating a webhook event back to an appointment relies on
 *     `notes.appointment_id` / `notes.clinic_id`, stamped on the Payment
 *     Link at creation time and copied by Razorpay onto the resulting
 *     Payment entity — see RazorpayClientService and
 *     PaymentWebhookService's header comments.
 *
 * 21. A late/expired "payment.captured" (appointment no longer
 *     PAYMENT_PENDING, or its hold already expired) is deliberately NOT
 *     auto-confirmed — logged for manual reconciliation instead, per
 *     explicit instruction. No admin UI for this exists (out of scope);
 *     structured logs are the only surface today.
 *
 * ── Invoice PDF (payment.captured side effect) ─────────────────────────
 *
 * 21b. After confirmPayment succeeds, InvoiceService synchronously generates
 *     a consultation invoice PDF (pdf-lib), stores it under
 *     `booking-invoices` / invoices/{clinic_id}/{appointment_id}.pdf
 *     (migration 024), and sends Meta template `appt_invoice` plus a
 *     free-form document attachment (approved template is body-only — no
 *     DOCUMENT header). Best-effort only — never rolls back confirm or the
 *     existing appt_booking_confirmed path. Gated by WHATSAPP_TEMPLATES_LIVE.
 *
 * ── Session 5 (REMINDER_SENT — scheduled reminders + no-response timeout) ──
 *
 * 22. REMINDER_SENT is deliberately NOT a conversation_state.current_state
 *     value, despite the session's own name — ARCHITECTURE.md section 4
 *     already documents it as `appointments (read, scheduled job) — no new
 *     row, status/notification only`. conversation_state is a singleton per
 *     (clinic_id, contact_phone) tracking one active pre-appointment flow;
 *     a contact can have multiple independently-reminded CONFIRMED
 *     appointments, which a single conversation_state row can't represent.
 *     Reminder progress lives on `appointments.reminder_24h_sent_at` /
 *     `reminder_2h_sent_at` (migration 021) instead.
 *
 * 23. New per-clinic config: `clinics.reminder_24h_offset_minutes` /
 *     `reminder_2h_offset_minutes` (migration 021, default 1440/120).
 *     ReminderService.runReminderSweep loops every clinic with WhatsApp
 *     configured (ClinicRepository.findAllWithWhatsAppConfigured) rather
 *     than one global query — PostgREST can't express "compare slot_start
 *     to now() + this row's own offset column" in a single request, and
 *     looping keeps every query scoped by clinic_id like everywhere else in
 *     this codebase. Flagged scale trade-off: this is O(clinics) queries per
 *     cron tick — fine pre-launch, revisit (e.g. a Postgres function) before
 *     the 5k-clinic target scale.
 *
 * 24. Reminder sends are stubbed (logged, not actually sent) unless
 *     WHATSAPP_TEMPLATES_LIVE=true, per explicit instruction — the real
 *     `appt_reminder_24h`/`appt_reminder_2h` templates are still pending
 *     Meta review. Do not flip that env var until they're confirmed
 *     approved (see WhatsAppClientService.sendTemplate and
 *     ReminderService._sendReminder).
 *
 * 25. Confirm/Cancel/Reschedule quick-replies on a reminder are routed by
 *     the webhook route BEFORE conversationStateService, using
 *     lib/reminder-reply.js to decode the target appointment_id directly
 *     from the button id. Confirm is an ack-only (no patient_confirmed
 *     column). Cancel uses cancelViaReminderReply + in-app notify.
 *     Reschedule enters SlotSelectionService.enterRescheduleFlow
 *     (conversation_state → SLOT_SELECTION with rescheduleAppointmentId)
 *     and updates the SAME appointments row on the next slot pick.
 *
 * 26. No-response timeout (past-due CONFIRMED, no reply) transitions
 *     straight to COMPLETED — NO_SHOW tracking is deferred per explicit
 *     instruction, no clinic config flag built for it yet.
 *
 * 27. Cron endpoint: GET /api/cron/booking-reminders, scheduled every 15 min
 *     in vercel.json, protected by CRON_SECRET (same Bearer-token pattern as
 *     the scribe feature's worker endpoints) — Vercel auto-injects that
 *     header on scheduled invocations once the env var is set. NOTE: Vercel
 *     Hobby plans cap built-in cron at once/day; a sub-daily schedule like
 *     this requires Pro (or an external scheduler hitting the same
 *     authenticated endpoint) — flagged, not silently assumed to deploy.
 *     Also required a middleware.js fix (same class of bug as the Meta/
 *     Razorpay webhook 307-to-/login issue from Session 4): the global auth
 *     middleware was redirecting this Bearer-token-authenticated route to
 *     /login before it ever reached assertWorkerAuthorized. Fixed by
 *     exempting the /api/cron/ prefix the same way PUBLIC_WEBHOOK_PATHS
 *     already exempts the two webhook routes — see middleware.js.
 */

// ─────────────────────────────────────────────────────────────
// DOMAIN EXPORTS
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
  MissingConsultationFeeError,
  WorkerUnauthorizedError,
  DatabaseError,
  isBookingError,
  toApiError,
} from "./errors.js";

export { NormalizedInboundMessageSchema } from "./schemas.js";

export { createLogger, bookingLogger } from "./logger.js";

export { verifyMetaSignature } from "./lib/signature.js";
export { verifyRazorpaySignature } from "./lib/razorpay-signature.js";
export { parseInboundWhatsAppWebhook } from "./lib/webhook-parser.js";
export { canTransitionConversation, assertValidConversationTransition } from "./lib/conversation-transitions.js";
export { isConversationExpired } from "./lib/conversation-expiry.js";
export { normalizePhoneForWhatsApp } from "./lib/phone.js";
export { describeInboundMessageForHandoff, describeContactForHandoff } from "./lib/handoff-summary.js";
export { levenshteinDistance, nameSimilarity, findClosestPatientMatch } from "./lib/fuzzy-match.js";
export { validatePatientName, parseAgeOrDob } from "./lib/patient-input.js";
export { buildPatientSelectionRows, patientOptionRowId, parsePatientOptionRowId } from "./lib/patient-list.js";
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

// ─────────────────────────────────────────────────────────────
// REPOSITORY + SERVICE EXPORTS
// ─────────────────────────────────────────────────────────────

export { ClinicRepository } from "./repository/clinic.repository.js";
export { ConversationStateRepository } from "./repository/conversation-state.repository.js";
export { DoctorProfileRepository } from "./repository/doctor-profile.repository.js";
export { PatientRepository } from "./repository/patient.repository.js";
export { AppointmentRepository } from "./repository/appointment.repository.js";
export { RazorpayWebhookEventRepository } from "./repository/razorpay-webhook-event.repository.js";
export { InvoiceRepository } from "./repository/invoice.repository.js";
export { WhatsAppClientService } from "./services/whatsapp-client.service.js";
export { RazorpayClientService } from "./services/razorpay-client.service.js";
export { DoctorNotificationService } from "./services/doctor-notification.service.js";
export { ConversationStateService } from "./services/conversation-state.service.js";
export { PatientCollectionService } from "./services/patient-collection.service.js";
export { SlotSelectionService } from "./services/slot-selection.service.js";
export { PaymentWebhookService } from "./services/payment-webhook.service.js";
export { ReminderService } from "./services/reminder.service.js";
export { InvoiceService } from "./services/invoice.service.js";
export { InvoiceStorageService } from "./services/invoice-storage.service.js";
export { sendInvoiceDocument } from "./services/invoice-whatsapp.js";
export {
  InAppNotificationService,
  NOTIFICATION_TYPE,
  formatPaymentReceivedMessage,
  formatAppointmentCancelledMessage,
  formatAppointmentRescheduledMessage,
  formatNotificationAmount,
} from "./services/in-app-notification.service.js";
export { NotificationRepository } from "./repository/notification.repository.js";
export { PaymentRepository } from "./repository/payment.repository.js";
export { PaymentsService } from "./services/payments.service.js";
export {
  PAYMENT_STATUS_FILTER,
  PAYMENT_STATUS_LABEL,
  formatPaymentStatusLabel,
  paymentStatusFilterToDb,
  resolvePaymentDateRange,
  escapeIlikePattern,
} from "./lib/payment-list.js";
export {
  generateInvoicePdf,
  buildInvoiceDisplayFields,
  formatInvoiceNumber,
} from "./lib/invoice-pdf.js";

// ─────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────

import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ClinicRepository as _ClinicRepo } from "./repository/clinic.repository.js";
import { ConversationStateRepository as _ConvRepo } from "./repository/conversation-state.repository.js";
import { DoctorProfileRepository as _DoctorRepo } from "./repository/doctor-profile.repository.js";
import { PatientRepository as _PatientRepo } from "./repository/patient.repository.js";
import { AppointmentRepository as _AppointmentRepo } from "./repository/appointment.repository.js";
import { RazorpayWebhookEventRepository as _RazorpayWebhookEventRepo } from "./repository/razorpay-webhook-event.repository.js";
import { InvoiceRepository as _InvoiceRepo } from "./repository/invoice.repository.js";
import { WhatsAppClientService as _WAClient } from "./services/whatsapp-client.service.js";
import { RazorpayClientService as _RazorpayClient } from "./services/razorpay-client.service.js";
import { DoctorNotificationService as _DoctorNotificationService } from "./services/doctor-notification.service.js";
import { ConversationStateService as _ConvService } from "./services/conversation-state.service.js";
import { PatientCollectionService as _PatientCollectionService } from "./services/patient-collection.service.js";
import { SlotSelectionService as _SlotSelectionService } from "./services/slot-selection.service.js";
import { PaymentWebhookService as _PaymentWebhookService } from "./services/payment-webhook.service.js";
import { ReminderService as _ReminderService } from "./services/reminder.service.js";
import { InvoiceStorageService as _InvoiceStorageService } from "./services/invoice-storage.service.js";
import { InvoiceService as _InvoiceService } from "./services/invoice.service.js";
import { NotificationRepository as _NotificationRepo } from "./repository/notification.repository.js";
import { InAppNotificationService as _InAppNotificationService } from "./services/in-app-notification.service.js";

/**
 * Wires together all booking domain services.
 * Always uses the service-role Supabase client — the webhook has no user
 * session, and RLS policies for patients/appointments/conversation_state
 * are deferred (see header note #3).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} [supabaseClient]
 * @returns {{
 *   clinicRepository: import("./repository/clinic.repository.js").ClinicRepository;
 *   conversationStateRepository: import("./repository/conversation-state.repository.js").ConversationStateRepository;
 *   doctorProfileRepository: import("./repository/doctor-profile.repository.js").DoctorProfileRepository;
 *   patientRepository: import("./repository/patient.repository.js").PatientRepository;
 *   appointmentRepository: import("./repository/appointment.repository.js").AppointmentRepository;
 *   razorpayWebhookEventRepository: import("./repository/razorpay-webhook-event.repository.js").RazorpayWebhookEventRepository;
 *   invoiceRepository: import("./repository/invoice.repository.js").InvoiceRepository;
 *   notificationRepository: import("./repository/notification.repository.js").NotificationRepository;
 *   whatsappClient: import("./services/whatsapp-client.service.js").WhatsAppClientService;
 *   razorpayClient: import("./services/razorpay-client.service.js").RazorpayClientService;
 *   doctorNotificationService: import("./services/doctor-notification.service.js").DoctorNotificationService;
 *   patientCollectionService: import("./services/patient-collection.service.js").PatientCollectionService;
 *   slotSelectionService: import("./services/slot-selection.service.js").SlotSelectionService;
 *   conversationStateService: import("./services/conversation-state.service.js").ConversationStateService;
 *   paymentWebhookService: import("./services/payment-webhook.service.js").PaymentWebhookService;
 *   reminderService: import("./services/reminder.service.js").ReminderService;
 *   invoiceService: import("./services/invoice.service.js").InvoiceService;
 *   invoiceStorageService: import("./services/invoice-storage.service.js").InvoiceStorageService;
 *   inAppNotificationService: import("./services/in-app-notification.service.js").InAppNotificationService;
 * }}
 */
export function createBookingServices(supabaseClient) {
  const supabase = supabaseClient ?? getSupabaseAdminClient();

  const clinicRepository = new _ClinicRepo(supabase);
  const conversationStateRepository = new _ConvRepo(supabase);
  const doctorProfileRepository = new _DoctorRepo(supabase);
  const patientRepository = new _PatientRepo(supabase);
  const appointmentRepository = new _AppointmentRepo(supabase);
  const razorpayWebhookEventRepository = new _RazorpayWebhookEventRepo(supabase);
  const invoiceRepository = new _InvoiceRepo(supabase);
  const notificationRepository = new _NotificationRepo(supabase);
  const whatsappClient = new _WAClient({
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    apiVersion:  process.env.WHATSAPP_API_VERSION,
  });
  const razorpayClient = new _RazorpayClient({
    keyId:     process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
  });
  const doctorNotificationService = new _DoctorNotificationService(doctorProfileRepository, whatsappClient);
  const inAppNotificationService = new _InAppNotificationService(
    notificationRepository,
    patientRepository,
  );
  const slotSelectionService = new _SlotSelectionService(
    conversationStateRepository,
    appointmentRepository,
    doctorProfileRepository,
    whatsappClient,
    doctorNotificationService,
    razorpayClient,
    { inAppNotificationService },
  );
  const patientCollectionService = new _PatientCollectionService(
    conversationStateRepository,
    patientRepository,
    whatsappClient,
    slotSelectionService,
  );
  const conversationStateService = new _ConvService(
    conversationStateRepository,
    whatsappClient,
    doctorNotificationService,
    patientCollectionService,
    slotSelectionService,
    appointmentRepository,
    inAppNotificationService,
  );
  const invoiceStorageService = new _InvoiceStorageService(supabase);
  const invoiceService = new _InvoiceService(
    invoiceRepository,
    invoiceStorageService,
    clinicRepository,
    patientRepository,
    doctorProfileRepository,
    {
      whatsappClient,
      templatesLive: process.env.WHATSAPP_TEMPLATES_LIVE === "true",
    },
  );
  const paymentWebhookService = new _PaymentWebhookService(
    appointmentRepository,
    clinicRepository,
    patientRepository,
    doctorProfileRepository,
    conversationStateRepository,
    whatsappClient,
    razorpayWebhookEventRepository,
    {
      templatesLive: process.env.WHATSAPP_TEMPLATES_LIVE === "true",
      invoiceService,
      inAppNotificationService,
    },
  );
  const reminderService = new _ReminderService(
    clinicRepository,
    appointmentRepository,
    patientRepository,
    whatsappClient,
    doctorNotificationService,
    {
      templatesLive: process.env.WHATSAPP_TEMPLATES_LIVE === "true",
      doctorProfileRepository,
      slotSelectionService,
      inAppNotificationService,
      razorpayClient,
    },
  );

  return {
    clinicRepository,
    conversationStateRepository,
    doctorProfileRepository,
    patientRepository,
    appointmentRepository,
    razorpayWebhookEventRepository,
    invoiceRepository,
    notificationRepository,
    whatsappClient,
    razorpayClient,
    doctorNotificationService,
    patientCollectionService,
    slotSelectionService,
    conversationStateService,
    paymentWebhookService,
    reminderService,
    invoiceService,
    invoiceStorageService,
    inAppNotificationService,
  };
}
