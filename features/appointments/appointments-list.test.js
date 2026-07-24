import test from "node:test";
import assert from "node:assert/strict";
import {
  appointmentStatusFilterToDb,
  formatAppointmentStatusLabel,
  formatRefundStatusLabel,
  resolveAppointmentSlotDateRange,
} from "../booking/lib/appointment-list.js";
import { AppointmentsService } from "./appointments.service.js";

test("appointmentStatusFilterToDb maps known statuses and all → null", () => {
  assert.equal(appointmentStatusFilterToDb("confirmed"), "confirmed");
  assert.equal(appointmentStatusFilterToDb("cancelled"), "cancelled");
  assert.equal(appointmentStatusFilterToDb("completed"), "completed");
  assert.equal(appointmentStatusFilterToDb("rescheduled"), "rescheduled");
  assert.equal(appointmentStatusFilterToDb("all"), null);
  assert.equal(appointmentStatusFilterToDb(null), null);
  assert.equal(appointmentStatusFilterToDb("bogus"), null);
});

test("formatAppointmentStatusLabel and formatRefundStatusLabel", () => {
  assert.equal(formatAppointmentStatusLabel("confirmed"), "Confirmed");
  assert.equal(formatAppointmentStatusLabel("cancelled"), "Cancelled");
  assert.equal(formatRefundStatusLabel("completed"), "Completed");
  assert.equal(formatRefundStatusLabel("failed"), "Failed");
  assert.equal(formatRefundStatusLabel(null), "—");
});

test("resolveAppointmentSlotDateRange today returns IST day bounds on slot date", () => {
  const now = new Date("2026-07-23T08:00:00.000Z");
  const { fromIso, toIso } = resolveAppointmentSlotDateRange("today", { now });
  assert.equal(fromIso, new Date("2026-07-23T00:00:00+05:30").toISOString());
  assert.equal(toIso, new Date("2026-07-23T23:59:59.999+05:30").toISOString());
});

function createListService(calls) {
  const appointmentRepository = {
    async listForClinicDashboard(clinicId, filters) {
      calls.push({ clinicId, filters });
      return {
        rows: [
          {
            id: "appt-1",
            patient_id: "patient-1",
            patient_name: "Asha Kumar",
            contact_phone: "919876543210",
            slot_start: "2026-07-23T04:30:00.000Z",
            slot_end: "2026-07-23T05:00:00.000Z",
            status: "cancelled",
            payment_status: "refunded",
            payment_amount: 500,
            refund_status: "completed",
            refund_id: "rfnd_1",
            refunded_at: "2026-07-23T05:00:00.000Z",
            created_at: "2026-07-22T10:00:00.000Z",
          },
        ],
        total: 1,
      };
    },
    async findForClinic() {
      return [];
    },
  };
  const patientRepository = {
    async findById() {
      return null;
    },
    async findAllForClinic() {
      return [];
    },
  };
  const doctorRepository = {
    async findPrimaryByClinicId() {
      return null;
    },
  };
  return new AppointmentsService(
    appointmentRepository,
    patientRepository,
    doctorRepository,
  );
}

test("AppointmentsService.listPaginated maps rows and passes search/status/slot range", async () => {
  const calls = [];
  const service = createListService(calls);
  const result = await service.listPaginated("clinic-1", {
    search: "Asha",
    status: "cancelled",
    range: "month",
    limit: 20,
    offset: 0,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].clinicId, "clinic-1");
  assert.equal(calls[0].filters.search, "Asha");
  assert.equal(calls[0].filters.status, "cancelled");
  assert.ok(calls[0].filters.fromIso);
  assert.ok(calls[0].filters.toIso);

  assert.equal(result.total, 1);
  assert.equal(result.hasMore, false);
  assert.equal(result.appointments[0].patientName, "Asha Kumar");
  assert.equal(result.appointments[0].statusLabel, "Cancelled");
  assert.equal(result.appointments[0].paymentStatusLabel, "Refunded");
  assert.equal(result.appointments[0].refundStatus, "completed");
  assert.equal(result.appointments[0].refundStatusLabel, "Completed");
  assert.equal(result.appointments[0].refundId, "rfnd_1");
  assert.equal(result.appointments[0].amount, 500);
  assert.ok(result.appointments[0].slotLabel);
});
