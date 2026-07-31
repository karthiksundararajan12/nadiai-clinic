import test from "node:test";
import assert from "node:assert/strict";
import { APPOINTMENT_STATUS } from "../../booking/constants.js";
import { EligibleConsultationService } from "./eligible-consultation.service.js";

function createService({ appointments = [], completedAppointmentIds = [] } = {}) {
  const calls = {
    findConfirmedForClinic: [],
    findCompletedAppointmentIds: [],
  };

  const appointmentRepository = {
    async findConfirmedForClinic(clinicId) {
      calls.findConfirmedForClinic.push(clinicId);
      return appointments;
    },
  };

  const sessionRepository = {
    async findCompletedAppointmentIds(clinicId, appointmentIds) {
      calls.findCompletedAppointmentIds.push({ clinicId, appointmentIds });
      return completedAppointmentIds;
    },
  };

  return {
    calls,
    service: new EligibleConsultationService(appointmentRepository, sessionRepository),
  };
}

test("listEligiblePatients excludes appointments with a completed scribe session", async () => {
  const { service, calls } = createService({
    appointments: [
      {
        id: "appt-done",
        patient_id: "patient-karthik",
        contact_phone: "919840227132",
        slot_start: "2026-07-31T04:00:00.000Z",
        status: APPOINTMENT_STATUS.CONFIRMED,
        patients: { full_name: "Karthik", age_years: 34, gender: "Male" },
      },
      {
        id: "appt-open",
        patient_id: "patient-asha",
        contact_phone: "919876543210",
        slot_start: "2026-07-31T05:00:00.000Z",
        status: APPOINTMENT_STATUS.CONFIRMED,
        patients: { full_name: "Asha Kumar", age_years: null, gender: null },
      },
    ],
    completedAppointmentIds: ["appt-done"],
  });

  const result = await service.listEligiblePatients("clinic-1");

  assert.deepEqual(calls.findConfirmedForClinic, ["clinic-1"]);
  assert.deepEqual(calls.findCompletedAppointmentIds, [{
    clinicId: "clinic-1",
    appointmentIds: ["appt-done", "appt-open"],
  }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].appointmentId, "appt-open");
  assert.equal(result[0].patientId, "patient-asha");
  assert.equal(result[0].patientName, "Asha Kumar");
});

test("listEligiblePatients includes the same patient for a new appointment after a prior completed one", async () => {
  const { service } = createService({
    appointments: [
      {
        id: "appt-old",
        patient_id: "patient-karthik",
        contact_phone: "919840227132",
        slot_start: "2026-07-30T04:00:00.000Z",
        status: APPOINTMENT_STATUS.CONFIRMED,
        patients: { full_name: "Karthik", age_years: 34, gender: "Male" },
      },
      {
        id: "appt-new",
        patient_id: "patient-karthik",
        contact_phone: "919840227132",
        slot_start: "2026-08-02T04:00:00.000Z",
        status: APPOINTMENT_STATUS.CONFIRMED,
        patients: { full_name: "Karthik", age_years: 34, gender: "Male" },
      },
    ],
    completedAppointmentIds: ["appt-old"],
  });

  const result = await service.listEligiblePatients("clinic-1");

  assert.deepEqual(result.map((row) => row.appointmentId), ["appt-new"]);
  assert.equal(result[0].patientId, "patient-karthik");
  assert.equal(result[0].patientName, "Karthik");
});
