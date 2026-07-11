import test from "node:test";
import assert from "node:assert/strict";
import {
  AppointmentRequestError,
  AppointmentsService,
} from "./appointments.service.js";

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
        slot_start: "2026-07-11T03:30:00.000Z",
        slot_end: "2026-07-11T04:00:00.000Z",
        status: "confirmed",
        payment_status: "paid",
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
  assert.equal(result[0].date, "2026-07-11");
  assert.equal(result[0].duration, 30);
  assert.equal(result[0].type, null);
});

test("creates a confirmed appointment through createIfAvailable", async () => {
  const { service, calls } = createService();

  await service.create("clinic-1", {
    patientId: "patient-1",
    date: "2026-07-12",
    time: "09:00",
  });

  assert.deepEqual(calls.create[0], {
    clinic_id: "clinic-1",
    doctor_id: "doctor-1",
    patient_id: "patient-1",
    contact_phone: "919876543210",
    slot_start: "2026-07-12T03:30:00.000Z",
    slot_end: "2026-07-12T04:00:00.000Z",
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
        date: "2026-07-12",
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

