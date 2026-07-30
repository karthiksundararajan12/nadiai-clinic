import test from "node:test";
import assert from "node:assert/strict";
import { VitalsRequestError, VitalsService } from "./vitals.service.js";

const CLINIC_A = "clinic-a";
const CLINIC_B = "clinic-b";
const ACTOR = "user-doctor-1";

const PATIENT = {
  id: "patient-1",
  clinic_id: CLINIC_A,
  full_name: "Asha Kumar",
  contact_phone: "919876543210",
};

const APPOINTMENT = {
  id: "appt-1",
  clinic_id: CLINIC_A,
  patient_id: "patient-1",
  status: "confirmed",
};

function createService({
  patient = PATIENT,
  appointment = APPOINTMENT,
  createResult,
  listResult,
} = {}) {
  const calls = {
    create: [],
    listForPatient: [],
    findPatientById: [],
    findAppointmentById: [],
  };

  const vitalsRepository = {
    async create(data) {
      calls.create.push(data);
      return (
        createResult ?? {
          id: "vitals-new",
          clinic_id: data.clinicId,
          patient_id: data.patientId,
          appointment_id: data.appointmentId,
          recorded_by: data.recordedBy,
          recorded_at: "2026-07-30T05:00:00.000Z",
          blood_pressure_systolic: data.bloodPressureSystolic,
          blood_pressure_diastolic: data.bloodPressureDiastolic,
          temperature_celsius: data.temperatureCelsius,
          weight_kg: data.weightKg,
          height_cm: data.heightCm,
          pulse_bpm: data.pulseBpm,
          spo2_percent: data.spo2Percent,
          notes: data.notes,
          created_at: "2026-07-30T05:00:00.000Z",
        }
      );
    },
    async listForPatient(clinicId, patientId) {
      calls.listForPatient.push({ clinicId, patientId });
      return listResult ?? [];
    },
  };

  const patientRepository = {
    async findById(clinicId, patientId) {
      calls.findPatientById.push({ clinicId, patientId });
      if (clinicId !== patient.clinic_id) return null;
      if (patientId !== patient.id) return null;
      return patient;
    },
  };

  const appointmentRepository = {
    async findByIdForClinic(clinicId, appointmentId) {
      calls.findAppointmentById.push({ clinicId, appointmentId });
      if (!appointment) return null;
      if (clinicId !== appointment.clinic_id) return null;
      if (appointmentId !== appointment.id) return null;
      return appointment;
    },
  };

  return {
    calls,
    service: new VitalsService(vitalsRepository, patientRepository, appointmentRepository),
  };
}

test("create with appointmentId derives patient_id from the appointment (ignores client patientId)", async () => {
  const { service, calls } = createService();

  const result = await service.create(CLINIC_A, ACTOR, {
    appointmentId: "appt-1",
    // Intentionally wrong — must be ignored once appointmentId is present.
    patientId: "patient-other",
    bloodPressureSystolic: 120,
    bloodPressureDiastolic: 80,
  });

  assert.equal(calls.findAppointmentById[0].clinicId, CLINIC_A);
  assert.equal(calls.create[0].patientId, "patient-1");
  assert.equal(calls.create[0].appointmentId, "appt-1");
  assert.equal(calls.create[0].recordedBy, ACTOR);
  assert.equal(calls.create[0].bloodPressureSystolic, 120);
  assert.equal(result.vitals.patientId, "patient-1");
  assert.equal(result.vitals.appointmentId, "appt-1");
});

test("create with appointmentId 404s when the appointment is not in the requesting clinic", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create(CLINIC_B, ACTOR, {
        appointmentId: "appt-1",
        temperatureCelsius: 37,
      }),
    (error) => error instanceof VitalsRequestError && error.statusCode === 404,
  );
});

test("create with bare patientId (no appointment) still works for direct entry", async () => {
  const { service, calls } = createService();

  const result = await service.create(CLINIC_A, ACTOR, {
    patientId: "patient-1",
    pulseBpm: 72,
  });

  assert.equal(calls.findAppointmentById.length, 0);
  assert.equal(calls.create[0].appointmentId, null);
  assert.equal(calls.create[0].patientId, "patient-1");
  assert.equal(result.vitals.pulseBpm, 72);
});

test("create 404s when patientId is not in the requesting clinic", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create(CLINIC_B, ACTOR, {
        patientId: "patient-1",
        weightKg: 60,
      }),
    (error) => error instanceof VitalsRequestError && error.statusCode === 404,
  );
});

test("create rejects an empty body (at least one vital or note required)", async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.create(CLINIC_A, ACTOR, { appointmentId: "appt-1" }),
    (error) =>
      error instanceof VitalsRequestError &&
      error.statusCode === 400 &&
      /at least one/i.test(error.message),
  );
});

test("create rejects out-of-range vital values", async () => {
  const { service } = createService();

  await assert.rejects(
    () =>
      service.create(CLINIC_A, ACTOR, {
        appointmentId: "appt-1",
        spo2Percent: 150,
      }),
    (error) =>
      error instanceof VitalsRequestError &&
      /SpO2 must be between/i.test(error.message),
  );
});

test("listForPatient scopes history to the requesting clinic and returns most-recent-first rows", async () => {
  const { service, calls } = createService({
    listResult: [
      {
        id: "vitals-2",
        patient_id: "patient-1",
        appointment_id: "appt-2",
        recorded_by: ACTOR,
        recorded_at: "2026-07-30T06:00:00.000Z",
        blood_pressure_systolic: 118,
        blood_pressure_diastolic: 76,
        temperature_celsius: null,
        weight_kg: null,
        height_cm: null,
        pulse_bpm: 70,
        spo2_percent: null,
        notes: null,
        created_at: "2026-07-30T06:00:00.000Z",
      },
      {
        id: "vitals-1",
        patient_id: "patient-1",
        appointment_id: "appt-1",
        recorded_by: ACTOR,
        recorded_at: "2026-07-29T05:00:00.000Z",
        blood_pressure_systolic: 120,
        blood_pressure_diastolic: 80,
        temperature_celsius: 36.8,
        weight_kg: 62.5,
        height_cm: 165,
        pulse_bpm: 72,
        spo2_percent: 98,
        notes: "Baseline",
        created_at: "2026-07-29T05:00:00.000Z",
      },
    ],
  });

  const rows = await service.listForPatient(CLINIC_A, "patient-1");

  assert.equal(calls.listForPatient[0].clinicId, CLINIC_A);
  assert.equal(calls.findPatientById[0].clinicId, CLINIC_A);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, "vitals-2");
  assert.equal(rows[0].pulseBpm, 70);
  assert.equal(rows[1].notes, "Baseline");
});

test("listForPatient 404s when the patient is not in the requesting clinic", async () => {
  const { service } = createService();

  await assert.rejects(
    () => service.listForPatient(CLINIC_B, "patient-1"),
    (error) => error instanceof VitalsRequestError && error.statusCode === 404,
  );
});
