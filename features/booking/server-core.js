/**
 * @fileoverview Server-only booking API without invoice PDF / font assets.
 *
 * Prefer this for Route Handlers that need repositories or createBookingServices
 * but do not generate invoice PDFs. PDF generation lives in `./server-pdf.js`.
 *
 * Usage:
 *   import { createBookingServices } from "@/features/booking/server-core";
 */

export * from "./client.js";

// Node-only helpers (crypto / ops I/O) — not safe for Client Components.
export { verifyMetaSignature } from "./lib/signature.js";
export { verifyRazorpaySignature } from "./lib/razorpay-signature.js";
export { parseInboundWhatsAppWebhook } from "./lib/webhook-parser.js";
export {
  alertOps,
  sendToOpsChannel,
  OPS_ALERT_STEP,
  VACCINATION_SEED_FAILURE_STEPS,
  WEBHOOK_ERROR_STEPS,
  WHATSAPP_SEND_FAILURE_STEPS,
} from "./lib/alerting.js";

// ─────────────────────────────────────────────────────────────
// REPOSITORY + SERVICE EXPORTS
// ─────────────────────────────────────────────────────────────

export { ClinicRepository } from "./repository/clinic.repository.js";
export { ConversationStateRepository } from "./repository/conversation-state.repository.js";
export { DoctorProfileRepository } from "./repository/doctor-profile.repository.js";
export { PatientRepository } from "./repository/patient.repository.js";
export { AppointmentRepository } from "./repository/appointment.repository.js";
export { RazorpayWebhookEventRepository } from "./repository/razorpay-webhook-event.repository.js";
export { OpsAlertRepository } from "./repository/ops-alert.repository.js";
export { InvoiceRepository } from "./repository/invoice.repository.js";
export { WhatsAppClientService } from "./services/whatsapp-client.service.js";
export { RazorpayClientService } from "./services/razorpay-client.service.js";
export { DoctorNotificationService } from "./services/doctor-notification.service.js";
export { ConversationStateService } from "./services/conversation-state.service.js";
export { PatientCollectionService } from "./services/patient-collection.service.js";
export { SlotSelectionService } from "./services/slot-selection.service.js";
export { PaymentWebhookService } from "./services/payment-webhook.service.js";
export { ReminderService } from "./services/reminder.service.js";
export { AppointmentCancelRefundService } from "./services/appointment-cancel-refund.service.js";
export { DailyDigestService } from "./services/daily-digest.service.js";
export { InvoiceStorageService } from "./services/invoice-storage.service.js";
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
export {
  PaymentsService,
  PaymentRequestError,
} from "./services/payments.service.js";
export { PaymentDeleteService } from "./services/payment-delete.service.js";
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

export { formatInvoiceNumber } from "./lib/invoice-number.js";

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
import { AppointmentCancelRefundService as _AppointmentCancelRefundService } from "./services/appointment-cancel-refund.service.js";
import { InvoiceStorageService as _InvoiceStorageService } from "./services/invoice-storage.service.js";
import { NotificationRepository as _NotificationRepo } from "./repository/notification.repository.js";
import { InAppNotificationService as _InAppNotificationService } from "./services/in-app-notification.service.js";
import { VaccinationRepository as _VaccinationRepo } from "../vaccinations/vaccination.repository.js";
import { VaccinationSeedingService as _VaccinationSeedingService } from "../vaccinations/vaccination-seeding.service.js";
import { SessionRepository as _ScribeSessionRepo } from "../scribe/repository/session.repository.js";

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
 *   appointmentCancelRefundService: import("./services/appointment-cancel-refund.service.js").AppointmentCancelRefundService;
 *   invoiceService: import("./services/invoice.service.js").InvoiceService|null;
 *   invoiceStorageService: import("./services/invoice-storage.service.js").InvoiceStorageService;
 *   inAppNotificationService: import("./services/in-app-notification.service.js").InAppNotificationService;
 *   vaccinationRepository: import("../vaccinations/vaccination.repository.js").VaccinationRepository;
 *   vaccinationSeedingService: import("../vaccinations/vaccination-seeding.service.js").VaccinationSeedingService;
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
  const vaccinationRepository = new _VaccinationRepo(supabase);
  const vaccinationSeedingService = new _VaccinationSeedingService(vaccinationRepository, doctorProfileRepository);
  const scribeSessionRepository = new _ScribeSessionRepo(supabase);
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
    { vaccinationSeedingService },
  );
  const appointmentCancelRefundService = new _AppointmentCancelRefundService(
    appointmentRepository,
    {
      razorpayClient,
      whatsappClient,
      inAppNotificationService,
      conversationStateRepository,
    },
  );
  const conversationStateService = new _ConvService(
    conversationStateRepository,
    whatsappClient,
    doctorNotificationService,
    patientCollectionService,
    slotSelectionService,
    appointmentRepository,
    inAppNotificationService,
    appointmentCancelRefundService,
  );
  const invoiceStorageService = new _InvoiceStorageService(supabase);
  // Invoice PDF generation is late-bound via attachInvoicePdf (server-pdf.js)
  // so non-PDF routes do not pull invoice-pdf.js / Noto fonts into NFT.
  const invoiceService = null;
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
      cancelRefundService: appointmentCancelRefundService,
      scribeSessionRepository,
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
    appointmentCancelRefundService,
    invoiceService,
    invoiceStorageService,
    inAppNotificationService,
    vaccinationRepository,
    vaccinationSeedingService,
  };
}
