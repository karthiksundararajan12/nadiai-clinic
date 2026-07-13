import test from "node:test";
import assert from "node:assert/strict";
import {
  AppointmentRequestError,
  AppointmentsService,
} from "./appointments.service.js";

// AppointmentsService.create/reschedule reject any slot that isn't in the
// future (see appointments.service.js), so booking-flow tests below use a
// date computed relative to "now" rather than a hardcoded literal — a fixed
// date would otherwise silently start failing once it lapses into the past.
function futureClinicDateKey(daysAhead = 30) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
const FUTURE_DATE = futureClinicDateKey();

function createService({
  appointments = [],
  patient = {
    id: "patient-1",
    full_name: "Asha Kumar",
    contact_phone: "919876543210",
  },
  doctor = {
    id: "doctor-1",
    full_name: "Dr. Rao",
    consultation_duration: 30,
  },
  createResult,
  cancelResult,
  rescheduleResult,
} = {}) {
  const calls = { list: [], create: [], cancel: [], reschedule: [] };
  const appointmentRepository = {
    async findForClinic(clinicId, filters) {
      calls.list.push({ clinicId, filters });
      return appointments;
    },
    async createIfAvailable(data) {
      calls.create.push(data);
      return createResult ?? { row: { id: "appointment-1", ...data }, conflict: null };
    },
    async cancelFromDashboard(clinicId, appointmentId) {
      calls.cancel.push({ clinicId, appointmentId });
      return cancelResult === undefined ? { id: appointmentId } : cancelResult;
    },
    async findByIdForClinic() {
      return {
        id: "appointment-1",
        slot_start: "2026-07-12T03:30:00.000Z",
        slot_end: "2026-07-12T04:00:00.000Z",
      };
    },
    async rescheduleFromDashboard(clinicId, appointmentId, slotStart, slotEnd) {
      calls.reschedule.push({ clinicId, appointmentId, slotStart, slotEnd });
      return rescheduleResult ?? { row: { id: appointmentId }, conflict: null };
    },
  };
  const patientRepository = {
    async findById() {
      return patient;
    },
    async findAllForClinic() {
      return [patient];
    },
  };
  const doctorRepository = {
    async findPrimaryByClinicId() {
      return doctor;
    },
  };
  return {
    calls,
    service: new AppointmentsService(
      appointmentRepository,
      patientRepository,
      doctorRepository,
    ),
  };
}

test("lists today's real appointments using clinic-local boundaries", async () => {
  const { service, calls } = createService({
    appointments: [
      {
        id: "appointment-1",
        patient_id: "patient-1",
        contact_phone: "919876543210",
        slot_start: "2026-07-11T03:30:00.000Z",
        slot_end: "2026-07-11T04:00:00.000Z",
        status: "confirmed",
        payment_status: "paid",
        payment_amount: 500,
        patients: { full_name: "Asha Kumar" },
      },
    ],
  });

  const result = await service.list(
    "clinic-1",
    "today",
    new Date("2026-07-11T06:30:00.000Z"),
  );

  assert.equal(calls.list[0].filters.fromIso, "2026-07-10T18:30:00.000Z");
  assert.equal(calls.list[0].filters.toIso, "2026-07-11T18:30:00.000Z");
  assert.equal(result[0].patient_name, "Asha Kumar");
  assert.equal(result[0].contact_phone, "919876543210");
  assert.equal(result[0].date, "2026-07-11");
  assert.equal(result[0].duration, 30);
  assert.equal(result[0].type, null);
  assert.equal(result[0].payment_amount, 500);
});

test("formats missing contact_phone and payment_amount as null rather than undefined", async () => {
  const { service } = createService({
    appointments: [
      {
        id: "appointment-2",
        patient_id: "patient-1",
        contact_phone: null,
        slot_start: "2026-07-11T03:30:00.000Z",
        slot_end: "2026-07-11T04:00:00.000Z",
        status: "payment_pending",
        payment_status: "not_required",
        payment_amount: null,
        patients: { full_name: "Asha Kumar" },
      },
    ],
  });

  const result = await service.list(
    "clinic-1",
    "all",
    new Date("2026-07-11T06:30:00.000Z"),
  );

  assert.equal(result[0].contact_phone, null);
  assert.equal(result[0].payment_amount, null);
});

test("creates a confirmed appointment through createIfAvailable", async () => {
  const { service, calls } = createService();

  await service.create("clinic-1", {
    patientId: "patient-1",
    date: FUTURE_DATE,
    time: "09:00",
  });

  const slotStart = new Date(`${FUTURE_DATE}T09:00:00+05:30`);
  const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
  assert.deepEqual(calls.create[0], {
    clinic_id: "clinic-1",
    doctor_id: "doctor-1",
    patient_id: "patient-1",
    contact_phone: "919876543210",
    slot_start: slotStart.toISOString(),
    slot_end: slotEnd.toISOString(),
    status: "confirmed",
    wa_message_id: null,
    payment_status: "not_required",
  });
});

test("surfaces slot conflicts and non-cancellable states", async () => {
  const conflict = createService({
    createResult: { row: null, conflict: "SLOT_TAKEN" },
  });
  await assert.rejects(
    () =>
      conflict.service.create("clinic-1", {
        patientId: "patient-1",
        date: FUTURE_DATE,
        time: "09:00",
      }),
    (error) =>
      error instanceof AppointmentRequestError &&
      error.statusCode === 409 &&
      /already taken/.test(error.message),
  );

  const notCancellable = createService({ cancelResult: null });
  await assert.rejects(
    () => notCancellable.service.cancel("clinic-1", "appointment-1"),
    (error) =>
      error instanceof AppointmentRequestError && error.statusCode === 409,
  );
});

