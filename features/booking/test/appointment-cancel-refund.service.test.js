import test from "node:test";
import assert from "node:assert/strict";
import { AppointmentCancelRefundService } from "../services/appointment-cancel-refund.service.js";
import {
  APPOINTMENT_STATUS,
  DOCTOR_CANCELLED_DASHBOARD_REASON,
  REFUND_STATUS,
  REMINDER_COPY,
} from "../constants.js";
import { RazorpaySendError, RefundRetryError, WhatsAppSendError } from "../errors.js";
import { maskPhoneForLog } from "../lib/phone.js";
import { RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT } from "../lib/razorpay-refund-alert.js";

const CLINIC = Object.freeze({
  id: "clinic-1",
  whatsapp_phone_number_id: "PNID_1",
});

function buildAppointment(overrides = {}) {
  return {
    id: "appt-1",
    clinic_id: "clinic-1",
    patient_id: "patient-1",
    doctor_id: "doctor-1",
    contact_phone: "919876543210",
    slot_start: "2026-07-12T03:30:00.000Z",
    slot_end: "2026-07-12T04:00:00.000Z",
    status: APPOINTMENT_STATUS.CANCELLED,
    cancellation_reason: DOCTOR_CANCELLED_DASHBOARD_REASON,
    payment_amount: 500,
    razorpay_payment_id: "pay_ABC",
    payment_status: "captured",
    ...overrides,
  };
}

function createFakeAppointmentRepo({
  cancelViaDoctorDashboardImpl = null,
  findByIdForClinicImpl = null,
} = {}) {
  const calls = {
    cancelViaDoctorDashboard: [],
    updateRefundFields: [],
    findByIdForClinic: [],
  };
  return {
    calls,
    async cancelViaDoctorDashboard(clinicId, appointmentId) {
      calls.cancelViaDoctorDashboard.push({ clinicId, appointmentId });
      if (cancelViaDoctorDashboardImpl) {
        return cancelViaDoctorDashboardImpl(clinicId, appointmentId);
      }
      return buildAppointment({ id: appointmentId });
    },
    async findByIdForClinic(clinicId, appointmentId) {
      calls.findByIdForClinic.push({ clinicId, appointmentId });
      if (findByIdForClinicImpl) {
        return findByIdForClinicImpl(clinicId, appointmentId);
      }
      return buildAppointment({ id: appointmentId });
    },
    async updateRefundFields(clinicId, appointmentId, fields) {
      calls.updateRefundFields.push({ clinicId, appointmentId, fields });
      return { id: appointmentId, clinic_id: clinicId, ...fields };
    },
  };
}

function createFakeRazorpay({ createRefundImpl = null } = {}) {
  const createRefundCalls = [];
  return {
    createRefundCalls,
    async createRefund(args) {
      createRefundCalls.push(args);
      if (createRefundImpl) return createRefundImpl(args);
      return { id: "rfnd_1", paymentId: args.paymentId, status: "processed" };
    },
  };
}

function createFakeWhatsApp({ sendTextImpl = null } = {}) {
  const sendTextCalls = [];
  return {
    sendTextCalls,
    async sendText(phoneNumberId, toPhone, body) {
      sendTextCalls.push({ phoneNumberId, toPhone, body });
      if (sendTextImpl) return sendTextImpl(phoneNumberId, toPhone, body);
    },
  };
}

function createFakeInApp() {
  const createAppointmentCancelledCalls = [];
  return {
    createAppointmentCancelledCalls,
    async createAppointmentCancelled(args) {
      createAppointmentCancelledCalls.push(args);
      return { id: "notif-1" };
    },
  };
}

function createFakeConversationStateRepo({ lastMessageAt = null } = {}) {
  const findCalls = [];
  return {
    findCalls,
    async find(clinicId, contactPhone) {
      findCalls.push({ clinicId, contactPhone });
      return { last_message_at: lastMessageAt };
    },
  };
}

test("maskPhoneForLog keeps only the last 4 digits", () => {
  assert.equal(maskPhoneForLog("919876543210"), "******3210");
  assert.equal(maskPhoneForLog("+91 98765 43210"), "******3210");
  assert.equal(maskPhoneForLog(null), "(none)");
});

test("cancelFromDoctorDashboard: cancels CONFIRMED, refunds, acks patient, notifies doctor", async () => {
  const appointmentRepo = createFakeAppointmentRepo();
  const razorpay = createFakeRazorpay();
  const wa = createFakeWhatsApp();
  const inApp = createFakeInApp();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
    whatsappClient: wa,
    inAppNotificationService: inApp,
  });

  const result = await service.cancelFromDoctorDashboard({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(appointmentRepo.calls.cancelViaDoctorDashboard.length, 1);
  assert.equal(razorpay.createRefundCalls.length, 1);
  assert.equal(razorpay.createRefundCalls[0].paymentId, "pay_ABC");
  assert.equal(
    razorpay.createRefundCalls[0].notes.reason,
    DOCTOR_CANCELLED_DASHBOARD_REASON,
  );
  assert.equal(wa.sendTextCalls.length, 1);
  assert.match(wa.sendTextCalls[0].body, /refund of ₹500/);
  assert.equal(inApp.createAppointmentCancelledCalls.length, 1);
  assert.equal(
    inApp.createAppointmentCancelledCalls[0].appointment.cancellation_reason,
    DOCTOR_CANCELLED_DASHBOARD_REASON,
  );
  assert.equal(result.refund_status, REFUND_STATUS.COMPLETED);
});

test("cancelFromDoctorDashboard: returns null when appointment is no longer CONFIRMED", async () => {
  const appointmentRepo = createFakeAppointmentRepo({
    cancelViaDoctorDashboardImpl: async () => null,
  });
  const razorpay = createFakeRazorpay();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
  });

  const result = await service.cancelFromDoctorDashboard({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(result, null);
  assert.equal(razorpay.createRefundCalls.length, 0);
});

test("cancelFromDoctorDashboard: unpaid appointment uses cancellation-only ack", async () => {
  const appointmentRepo = createFakeAppointmentRepo({
    cancelViaDoctorDashboardImpl: async () =>
      buildAppointment({
        razorpay_payment_id: null,
        payment_status: "not_required",
        payment_amount: null,
      }),
  });
  const wa = createFakeWhatsApp();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    whatsappClient: wa,
  });

  const result = await service.cancelFromDoctorDashboard({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(result.refund_status, REFUND_STATUS.NOT_APPLICABLE);
  assert.equal(wa.sendTextCalls.length, 1);
  assert.ok(wa.sendTextCalls[0].body.includes("has been cancelled"));
  assert.ok(!wa.sendTextCalls[0].body.includes("refund of"));
  assert.match(wa.sendTextCalls[0].body, new RegExp(REMINDER_COPY.CANCEL_ACK.slice(0, 20)));
});

test("cancelFromDoctorDashboard: Razorpay failure still cancels and skips refund ack wording", async () => {
  const appointmentRepo = createFakeAppointmentRepo();
  const razorpay = createFakeRazorpay({
    createRefundImpl: async () => {
      throw new RazorpaySendError("Razorpay refund API responded with 500");
    },
  });
  const wa = createFakeWhatsApp();
  const inApp = createFakeInApp();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
    whatsappClient: wa,
    inAppNotificationService: inApp,
  });

  const result = await service.cancelFromDoctorDashboard({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(result.refund_status, REFUND_STATUS.FAILED);
  assert.equal(wa.sendTextCalls.length, 1);
  assert.ok(!wa.sendTextCalls[0].body.includes("refund of"));
  assert.equal(inApp.createAppointmentCancelledCalls.length, 1);
});

test("cancelFromPatientMenu: cancels with patient_cancelled_menu and runs refund+ack pipeline", async () => {
  const appointmentRepo = createFakeAppointmentRepo({
    cancelViaDoctorDashboardImpl: null,
  });
  appointmentRepo.cancelViaMenu = async (clinicId, appointmentId) => {
    appointmentRepo.calls.cancelViaMenu = appointmentRepo.calls.cancelViaMenu ?? [];
    appointmentRepo.calls.cancelViaMenu.push({ clinicId, appointmentId });
    return buildAppointment({
      id: appointmentId,
      cancellation_reason: "patient_cancelled_menu",
    });
  };
  const razorpay = createFakeRazorpay();
  const wa = createFakeWhatsApp();
  const inApp = createFakeInApp();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
    whatsappClient: wa,
    inAppNotificationService: inApp,
  });

  const result = await service.cancelFromPatientMenu({
    clinic: CLINIC,
    appointmentId: "appt-1",
    contactPhone: "919876543210",
  });

  assert.equal(result.cancellation_reason, "patient_cancelled_menu");
  assert.equal(result.refund_status, REFUND_STATUS.COMPLETED);
  assert.equal(razorpay.createRefundCalls[0].notes.reason, "patient_cancelled_menu");
  assert.equal(wa.sendTextCalls.length, 1);
  assert.equal(inApp.createAppointmentCancelledCalls.length, 1);
});

test("finalizeAfterCancel: WhatsApp ack failure does not roll back a completed refund", async () => {
  const appointmentRepo = createFakeAppointmentRepo();
  const razorpay = createFakeRazorpay();
  const wa = createFakeWhatsApp({
    sendTextImpl: async () => {
      throw new WhatsAppSendError("Rate limit hit", {
        message: "Rate limit hit",
        type: "OAuthException",
        code: 4,
      });
    },
  });
  const inApp = createFakeInApp();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
    whatsappClient: wa,
    inAppNotificationService: inApp,
  });

  const result = await service.cancelFromDoctorDashboard({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(result.refund_status, REFUND_STATUS.COMPLETED);
  assert.equal(razorpay.createRefundCalls.length, 1);
  assert.equal(wa.sendTextCalls.length, 1);
  assert.equal(inApp.createAppointmentCancelledCalls.length, 1);
});

test("finalizeAfterCancel: Meta 131047 session-window failure still keeps refund + in-app notify", async () => {
  const appointmentRepo = createFakeAppointmentRepo();
  const razorpay = createFakeRazorpay();
  const wa = createFakeWhatsApp({
    sendTextImpl: async () => {
      throw new WhatsAppSendError(
        "Message failed to send because more than 24 hours have passed",
        {
          message:
            "Message failed to send because more than 24 hours have passed since the customer last replied",
          type: "OAuthException",
          code: 131047,
        },
      );
    },
  });
  const inApp = createFakeInApp();
  const conversationStateRepository = createFakeConversationStateRepo({
    lastMessageAt: "2020-01-01T00:00:00.000Z",
  });
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
    whatsappClient: wa,
    inAppNotificationService: inApp,
    conversationStateRepository,
  });

  const result = await service.cancelFromDoctorDashboard({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(conversationStateRepository.findCalls.length, 1);
  assert.equal(result.refund_status, REFUND_STATUS.COMPLETED);
  assert.equal(inApp.createAppointmentCancelledCalls.length, 1);
});

test("finalizeAfterCancel: still attempts plain-text ack when session window looks closed", async () => {
  const appointmentRepo = createFakeAppointmentRepo();
  const razorpay = createFakeRazorpay();
  const wa = createFakeWhatsApp();
  const conversationStateRepository = createFakeConversationStateRepo({
    lastMessageAt: "2020-01-01T00:00:00.000Z",
  });
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
    whatsappClient: wa,
    conversationStateRepository,
  });

  await service.cancelFromDoctorDashboard({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(conversationStateRepository.findCalls.length, 1);
  assert.equal(
    wa.sendTextCalls.length,
    1,
    "ack send is still attempted; failure is logged not skipped",
  );
});

test("retryFailedRefund: refunds failed appointment with fresh idempotency key", async () => {
  const appointmentRepo = createFakeAppointmentRepo({
    findByIdForClinicImpl: async () =>
      buildAppointment({
        refund_status: REFUND_STATUS.FAILED,
        payment_status: "paid",
        cancellation_reason: "patient_no_show",
      }),
  });
  const razorpay = createFakeRazorpay();
  const wa = createFakeWhatsApp();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
    whatsappClient: wa,
  });

  const result = await service.retryFailedRefund({
    clinic: CLINIC,
    appointmentId: "appt-1",
  });

  assert.equal(result.refund_status, REFUND_STATUS.COMPLETED);
  assert.equal(result.payment_status, "refunded");
  assert.equal(razorpay.createRefundCalls.length, 1);
  assert.match(
    razorpay.createRefundCalls[0].idempotencyKey,
    /^appt_refund_retry_appt-1_\d+$/,
  );
  assert.equal(razorpay.createRefundCalls[0].notes.reason, "patient_no_show");
  assert.equal(wa.sendTextCalls.length, 0, "retry must not re-ack the patient");
  const statuses = appointmentRepo.calls.updateRefundFields.map((c) => c.fields.refundStatus);
  assert.ok(statuses.includes(REFUND_STATUS.PROCESSING));
  assert.ok(statuses.includes(REFUND_STATUS.COMPLETED));
});

test("retryFailedRefund: refuses when refund_status is not failed", async () => {
  const appointmentRepo = createFakeAppointmentRepo({
    findByIdForClinicImpl: async () =>
      buildAppointment({ refund_status: REFUND_STATUS.COMPLETED }),
  });
  const razorpay = createFakeRazorpay();
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
  });

  await assert.rejects(
    () => service.retryFailedRefund({ clinic: CLINIC, appointmentId: "appt-1" }),
    (err) => err instanceof RefundRetryError && err.statusCode === 409,
  );
  assert.equal(razorpay.createRefundCalls.length, 0);
});

test("retryFailedRefund: rethrows RazorpaySendError so the API can surface the failure", async () => {
  const appointmentRepo = createFakeAppointmentRepo({
    findByIdForClinicImpl: async () =>
      buildAppointment({
        refund_status: REFUND_STATUS.FAILED,
        payment_status: "paid",
      }),
  });
  const razorpay = createFakeRazorpay({
    createRefundImpl: async () => {
      throw new RazorpaySendError("invalid request sent", {
        hint: RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT,
        razorpayTestMode: true,
      });
    },
  });
  const service = new AppointmentCancelRefundService(appointmentRepo, {
    razorpayClient: razorpay,
  });

  await assert.rejects(
    () => service.retryFailedRefund({ clinic: CLINIC, appointmentId: "appt-1" }),
    (err) =>
      err instanceof RazorpaySendError &&
      err.details?.hint === RAZORPAY_TEST_MODE_INSUFFICIENT_BALANCE_HINT,
  );
  const last = appointmentRepo.calls.updateRefundFields.at(-1);
  assert.equal(last.fields.refundStatus, REFUND_STATUS.FAILED);
});
