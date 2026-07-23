import test from "node:test";
import assert from "node:assert/strict";
import {
  InAppNotificationService,
  NOTIFICATION_TYPE,
  formatPaymentReceivedMessage,
} from "../services/in-app-notification.service.js";
import { formatSlotLabel } from "../lib/slot-engine.js";

const CLINIC_A = "clinic-a";
const CLINIC_B = "clinic-b";
const APPOINTMENT = {
  id: "appt-1",
  doctor_id: "doctor-profile-1",
  patient_id: "patient-1",
  payment_amount: 500,
  slot_start: "2026-07-06T03:30:00.000Z",
};

function createFakeNotificationRepo(seed = []) {
  /** @type {Array<object>} */
  let rows = seed.map((r) => ({ ...r }));
  const insertCalls = [];

  return {
    insertCalls,
    get rows() {
      return rows;
    },
    async insert({
      clinicId,
      doctorId = null,
      type,
      title,
      message,
      relatedAppointmentId = null,
    }) {
      insertCalls.push({ clinicId, doctorId, type, title, message, relatedAppointmentId });
      const row = {
        id: `notif-${rows.length + 1}`,
        clinic_id: clinicId,
        doctor_id: doctorId,
        type,
        title,
        message,
        related_appointment_id: relatedAppointmentId,
        is_read: false,
        created_at: new Date().toISOString(),
      };
      rows = [row, ...rows];
      return row;
    },
    async listRecentForClinic(clinicId, { limit = 20, offset = 0 } = {}) {
      return rows
        .filter((r) => r.clinic_id === clinicId)
        .slice(offset, offset + limit);
    },
    async findByIdForClinic(clinicId, notificationId) {
      const row = rows.find((r) => r.id === notificationId && r.clinic_id === clinicId);
      return row ? { ...row } : null;
    },
    async countForClinic(clinicId) {
      return rows.filter((r) => r.clinic_id === clinicId).length;
    },
    async countUnreadForClinic(clinicId) {
      return rows.filter((r) => r.clinic_id === clinicId && !r.is_read).length;
    },
    async markRead(clinicId, notificationId) {
      const row = rows.find((r) => r.id === notificationId && r.clinic_id === clinicId);
      if (!row) return null;
      row.is_read = true;
      return { ...row };
    },
    async markAllRead(clinicId) {
      let updated = 0;
      for (const row of rows) {
        if (row.clinic_id === clinicId && !row.is_read) {
          row.is_read = true;
          updated += 1;
        }
      }
      return updated;
    },
  };
}

function createFakePatientRepo(patient = { id: "patient-1", full_name: "Asha Kumar" }) {
  return {
    async findById(clinicId, patientId) {
      assert.equal(patientId, "patient-1");
      // Tenancy: only return patient when clinic matches the caller's clinic
      if (clinicId !== CLINIC_A) return null;
      return patient;
    },
  };
}

test("formatPaymentReceivedMessage includes patient, amount, and slot label", () => {
  const slot = "2026-07-06T03:30:00.000Z";
  const message = formatPaymentReceivedMessage({
    patientName: "Asha Kumar",
    amount: 500,
    slotStart: slot,
  });
  assert.equal(
    message,
    `Asha Kumar paid ₹500 for appointment on ${formatSlotLabel(new Date(slot))}`,
  );
});

test("createPaymentReceived inserts payment_received row scoped to clinic_id", async () => {
  const repo = createFakeNotificationRepo();
  const service = new InAppNotificationService(repo, createFakePatientRepo());

  const row = await service.createPaymentReceived({
    clinicId: CLINIC_A,
    appointment: APPOINTMENT,
  });

  assert.equal(repo.insertCalls.length, 1);
  assert.equal(repo.insertCalls[0].clinicId, CLINIC_A);
  assert.equal(repo.insertCalls[0].doctorId, "doctor-profile-1");
  assert.equal(repo.insertCalls[0].type, NOTIFICATION_TYPE.PAYMENT_RECEIVED);
  assert.equal(repo.insertCalls[0].title, "Payment received");
  assert.equal(repo.insertCalls[0].relatedAppointmentId, "appt-1");
  assert.match(repo.insertCalls[0].message, /^Asha Kumar paid ₹500 for appointment on /);
  assert.equal(row.clinic_id, CLINIC_A);
  assert.equal(row.is_read, false);
});

test("listForClinic unreadCount is scoped to the requesting clinic only", async () => {
  const repo = createFakeNotificationRepo([
    {
      id: "n1",
      clinic_id: CLINIC_A,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "A",
      related_appointment_id: null,
      is_read: false,
      created_at: "2026-07-01T10:00:00.000Z",
    },
    {
      id: "n2",
      clinic_id: CLINIC_B,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "B",
      related_appointment_id: null,
      is_read: false,
      created_at: "2026-07-01T11:00:00.000Z",
    },
    {
      id: "n3",
      clinic_id: CLINIC_A,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "A2",
      related_appointment_id: null,
      is_read: true,
      created_at: "2026-07-01T09:00:00.000Z",
    },
  ]);
  const service = new InAppNotificationService(repo, createFakePatientRepo());

  const forA = await service.listForClinic(CLINIC_A, { limit: 20 });
  assert.equal(forA.unreadCount, 1);
  assert.equal(forA.notifications.length, 2);
  assert.ok(forA.notifications.every((n) => n.clinic_id === CLINIC_A));

  const forB = await service.getUnreadCount(CLINIC_B);
  assert.equal(forB, 1);
});

test("listForClinic supports offset pagination and hasMore", async () => {
  const seed = Array.from({ length: 5 }, (_, i) => ({
    id: `n${i}`,
    clinic_id: CLINIC_A,
    doctor_id: null,
    type: "payment_received",
    title: "Payment received",
    message: `msg-${i}`,
    related_appointment_id: null,
    is_read: false,
    created_at: `2026-07-0${i + 1}T10:00:00.000Z`,
  }));
  const repo = createFakeNotificationRepo(seed);
  const service = new InAppNotificationService(repo, createFakePatientRepo());

  const page1 = await service.listForClinic(CLINIC_A, { limit: 2, offset: 0 });
  assert.equal(page1.notifications.length, 2);
  assert.equal(page1.total, 5);
  assert.equal(page1.hasMore, true);

  const page2 = await service.listForClinic(CLINIC_A, { limit: 2, offset: 2 });
  assert.equal(page2.notifications.length, 2);
  assert.equal(page2.hasMore, true);

  const page3 = await service.listForClinic(CLINIC_A, { limit: 2, offset: 4 });
  assert.equal(page3.notifications.length, 1);
  assert.equal(page3.hasMore, false);
});

test("getById returns clinic-scoped notification or null", async () => {
  const repo = createFakeNotificationRepo([
    {
      id: "n-mine",
      clinic_id: CLINIC_A,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "Karthik paid ₹799 for appointment on Thu 23 Jul, 10:00 AM",
      related_appointment_id: "appt-1",
      is_read: false,
      created_at: "2026-07-01T10:00:00.000Z",
    },
  ]);
  const service = new InAppNotificationService(repo, createFakePatientRepo());

  const found = await service.getById(CLINIC_A, "n-mine");
  assert.equal(found?.id, "n-mine");
  assert.match(found.message, /Karthik paid ₹799/);

  const crossClinic = await service.getById(CLINIC_B, "n-mine");
  assert.equal(crossClinic, null);
});

test("markRead only updates a notification belonging to that clinic", async () => {
  const repo = createFakeNotificationRepo([
    {
      id: "n-other",
      clinic_id: CLINIC_B,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "other clinic",
      related_appointment_id: null,
      is_read: false,
      created_at: "2026-07-01T10:00:00.000Z",
    },
    {
      id: "n-mine",
      clinic_id: CLINIC_A,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "mine",
      related_appointment_id: null,
      is_read: false,
      created_at: "2026-07-01T11:00:00.000Z",
    },
  ]);
  const service = new InAppNotificationService(repo, createFakePatientRepo());

  const crossClinic = await service.markRead(CLINIC_A, "n-other");
  assert.equal(crossClinic, null);
  assert.equal(await service.getUnreadCount(CLINIC_B), 1);

  const mine = await service.markRead(CLINIC_A, "n-mine");
  assert.equal(mine?.is_read, true);
  assert.equal(await service.getUnreadCount(CLINIC_A), 0);
});

test("markAllRead clears unread for one clinic only", async () => {
  const repo = createFakeNotificationRepo([
    {
      id: "a1",
      clinic_id: CLINIC_A,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "a1",
      related_appointment_id: null,
      is_read: false,
      created_at: "2026-07-01T10:00:00.000Z",
    },
    {
      id: "a2",
      clinic_id: CLINIC_A,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "a2",
      related_appointment_id: null,
      is_read: false,
      created_at: "2026-07-01T11:00:00.000Z",
    },
    {
      id: "b1",
      clinic_id: CLINIC_B,
      doctor_id: null,
      type: "payment_received",
      title: "Payment received",
      message: "b1",
      related_appointment_id: null,
      is_read: false,
      created_at: "2026-07-01T12:00:00.000Z",
    },
  ]);
  const service = new InAppNotificationService(repo, createFakePatientRepo());

  const updated = await service.markAllRead(CLINIC_A);
  assert.equal(updated, 2);
  assert.equal(await service.getUnreadCount(CLINIC_A), 0);
  assert.equal(await service.getUnreadCount(CLINIC_B), 1);
});
