/**
 * @fileoverview InAppNotificationService — create + list + mark-read for
 * clinic-scoped doctor notifications (dashboard bell).
 *
 * Distinct from DoctorNotificationService (WhatsApp HUMAN_HANDOFF alerts).
 */

import { formatSlotLabel } from "../lib/slot-engine.js";
import { createLogger } from "../logger.js";

export const NOTIFICATION_TYPE = Object.freeze({
  PAYMENT_RECEIVED: "payment_received",
  APPOINTMENT_CANCELLED: "appointment_cancelled",
  APPOINTMENT_RESCHEDULED: "appointment_rescheduled",
});

/**
 * @param {number|string|null|undefined} amount
 * @returns {string}
 */
export function formatNotificationAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return String(amount ?? "");
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

/**
 * @param {{ patientName: string; amount: number|string|null|undefined; slotStart: string|Date }} params
 * @returns {string}
 */
export function formatPaymentReceivedMessage({ patientName, amount, slotStart }) {
  const slot =
    slotStart instanceof Date
      ? formatSlotLabel(slotStart)
      : formatSlotLabel(new Date(slotStart));
  return `${patientName} paid ₹${formatNotificationAmount(amount)} for appointment on ${slot}`;
}

/**
 * @param {{ patientName: string; slotStart: string|Date }} params
 * @returns {string}
 */
export function formatAppointmentCancelledMessage({ patientName, slotStart }) {
  const slot =
    slotStart instanceof Date
      ? formatSlotLabel(slotStart)
      : formatSlotLabel(new Date(slotStart));
  return `${patientName} cancelled their appointment on ${slot}`;
}

/**
 * @param {{ patientName: string; slotStart: string|Date }} params
 * @returns {string}
 */
export function formatAppointmentRescheduledMessage({ patientName, slotStart }) {
  const slot =
    slotStart instanceof Date
      ? formatSlotLabel(slotStart)
      : formatSlotLabel(new Date(slotStart));
  return `${patientName} rescheduled their appointment to ${slot}`;
}

export class InAppNotificationService {
  /**
   * @param {import("../repository/notification.repository.js").NotificationRepository} notificationRepo
   * @param {import("../repository/patient.repository.js").PatientRepository} patientRepo
   */
  constructor(notificationRepo, patientRepo) {
    this._notificationRepo = notificationRepo;
    this._patientRepo = patientRepo;
    this._log = createLogger({ component: "InAppNotificationService" });
  }

  /**
   * Inserts a payment_received notification for the clinic/doctor on the
   * appointment. Caller wraps in try/catch for best-effort webhook use.
   *
   * @param {{ clinicId: string; appointment: {
   *   id: string;
   *   doctor_id?: string|null;
   *   patient_id?: string|null;
   *   payment_amount?: number|null;
   *   slot_start: string;
   * } }} params
   * @returns {Promise<import("../repository/notification.repository.js").ClinicNotification>}
   */
  async createPaymentReceived({ clinicId, appointment }) {
    let patientName = "A patient";
    if (appointment.patient_id) {
      const patient = await this._patientRepo.findById(clinicId, appointment.patient_id);
      if (patient?.full_name) patientName = patient.full_name;
    }

    return this._notificationRepo.insert({
      clinicId,
      doctorId: appointment.doctor_id ?? null,
      type: NOTIFICATION_TYPE.PAYMENT_RECEIVED,
      title: "Payment received",
      message: formatPaymentReceivedMessage({
        patientName,
        amount: appointment.payment_amount,
        slotStart: appointment.slot_start,
      }),
      relatedAppointmentId: appointment.id,
    });
  }

  /**
   * Inserts an appointment_cancelled notification after a patient WhatsApp
   * "cancel". Caller wraps in try/catch for best-effort use.
   *
   * @param {{ clinicId: string; appointment: {
   *   id: string;
   *   doctor_id?: string|null;
   *   patient_id?: string|null;
   *   slot_start: string;
   * } }} params
   * @returns {Promise<import("../repository/notification.repository.js").ClinicNotification>}
   */
  async createAppointmentCancelled({ clinicId, appointment }) {
    let patientName = "A patient";
    if (appointment.patient_id) {
      const patient = await this._patientRepo.findById(clinicId, appointment.patient_id);
      if (patient?.full_name) patientName = patient.full_name;
    }

    return this._notificationRepo.insert({
      clinicId,
      doctorId: appointment.doctor_id ?? null,
      type: NOTIFICATION_TYPE.APPOINTMENT_CANCELLED,
      title: "Appointment cancelled",
      message: formatAppointmentCancelledMessage({
        patientName,
        slotStart: appointment.slot_start,
      }),
      relatedAppointmentId: appointment.id,
    });
  }

  /**
   * Inserts an appointment_rescheduled notification after a patient
   * self-serve reminder Reschedule + new slot pick.
   *
   * @param {{ clinicId: string; appointment: {
   *   id: string;
   *   doctor_id?: string|null;
   *   patient_id?: string|null;
   *   slot_start: string;
   * } }} params
   * @returns {Promise<import("../repository/notification.repository.js").ClinicNotification>}
   */
  async createAppointmentRescheduled({ clinicId, appointment }) {
    let patientName = "A patient";
    if (appointment.patient_id) {
      const patient = await this._patientRepo.findById(clinicId, appointment.patient_id);
      if (patient?.full_name) patientName = patient.full_name;
    }

    return this._notificationRepo.insert({
      clinicId,
      doctorId: appointment.doctor_id ?? null,
      type: NOTIFICATION_TYPE.APPOINTMENT_RESCHEDULED,
      title: "Appointment rescheduled",
      message: formatAppointmentRescheduledMessage({
        patientName,
        slotStart: appointment.slot_start,
      }),
      relatedAppointmentId: appointment.id,
    });
  }

  /**
   * @param {string} clinicId
   * @param {{ limit?: number; offset?: number }} [opts]
   */
  async listForClinic(clinicId, { limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const [notifications, unreadCount, total] = await Promise.all([
      this._notificationRepo.listRecentForClinic(clinicId, {
        limit: safeLimit,
        offset: safeOffset,
      }),
      this._notificationRepo.countUnreadForClinic(clinicId),
      this._notificationRepo.countForClinic(clinicId),
    ]);
    return {
      notifications,
      unreadCount,
      total,
      limit: safeLimit,
      offset: safeOffset,
      hasMore: safeOffset + notifications.length < total,
    };
  }

  /**
   * @param {string} clinicId
   * @param {string} notificationId
   * @returns {Promise<import("../repository/notification.repository.js").ClinicNotification|null>}
   */
  async getById(clinicId, notificationId) {
    return this._notificationRepo.findByIdForClinic(clinicId, notificationId);
  }

  /**
   * @param {string} clinicId
   * @returns {Promise<number>}
   */
  async getUnreadCount(clinicId) {
    return this._notificationRepo.countUnreadForClinic(clinicId);
  }

  /**
   * @param {string} clinicId
   * @param {string} notificationId
   */
  async markRead(clinicId, notificationId) {
    return this._notificationRepo.markRead(clinicId, notificationId);
  }

  /**
   * @param {string} clinicId
   */
  async markAllRead(clinicId) {
    return this._notificationRepo.markAllRead(clinicId);
  }
}
