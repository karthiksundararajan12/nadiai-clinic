import test from "node:test";
import assert from "node:assert/strict";
import { DashboardService } from "./dashboard.service.js";

test("builds clinic-scoped dashboard counts, lists, and seven-day activity", async () => {
  const calls = { patients: [], appointments: [], sessions: [] };
  const patientRepository = {
    async getDashboardSummary(clinicId, limit) {
      calls.patients.push({ clinicId, limit });
      return {
        total: 2,
        recent: [
          {
            id: "patient-1",
            full_name: "Asha Kumar",
            updated_at: "2026-07-10T10:00:00.000Z",
          },
        ],
      };
    },
  };
  const appointmentRepository = {
    async findDashboardActivity(clinicId, fromIso, toIso) {
      calls.appointments.push({ clinicId, fromIso, toIso });
      return [
        {
          id: "appointment-old",
          patient_id: "patient-1",
          slot_start: "2026-07-05T04:30:00.000Z",
          status: "completed",
          patients: { full_name: "Asha Kumar" },
        },
        {
          id: "appointment-today",
          patient_id: "patient-1",
          slot_start: "2026-07-11T05:30:00.000Z",
          status: "confirmed",
          patients: { full_name: "Asha Kumar" },
        },
      ];
    },
  };
  const sessionService = {
    async listSessions(filters, ctx) {
      calls.sessions.push({ filters, ctx });
      return { data: [], total: 3 };
    },
  };
  const service = new DashboardService(
    patientRepository,
    appointmentRepository,
    sessionService,
  );
  const ctx = { clinicId: "clinic-1", doctorId: "doctor-1" };

  const result = await service.getDashboardData(
    ctx,
    new Date("2026-07-11T06:30:00.000Z"),
  );

  assert.deepEqual(calls.patients, [{ clinicId: "clinic-1", limit: 4 }]);
  assert.equal(calls.appointments[0].clinicId, "clinic-1");
  assert.equal(calls.appointments[0].fromIso, "2026-07-04T18:30:00.000Z");
  assert.equal(calls.appointments[0].toIso, "2026-07-11T18:30:00.000Z");
  assert.equal(calls.sessions[0].filters.status, "COMPLETED");
  assert.equal(calls.sessions[0].filters.date_from, "2026-07-05T18:30:00.000Z");
  assert.equal(result.stats.totalPatients, 2);
  assert.equal(result.stats.activePatients, 2);
  assert.equal(result.stats.todayAppointments, 1);
  assert.equal(result.stats.completedScribeSessionsThisWeek, 3);
  assert.equal(result.todayAppointments[0].patientName, "Asha Kumar");
  assert.equal(result.todayAppointments[0].status, "confirmed");
  assert.equal(result.todayAppointments[0].type, null);
  assert.equal(result.weeklyActivity.length, 7);
  assert.equal(
    result.weeklyActivity.reduce((sum, day) => sum + day.count, 0),
    2,
  );
  assert.equal(result.weeklyActivity.at(-1).isToday, true);
  assert.equal(result.metadata.activePatientDefinition, "non_deleted");
  assert.equal(result.metadata.appointmentTypeAvailable, false);
});

