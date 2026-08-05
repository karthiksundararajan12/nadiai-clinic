import test from "node:test";
import assert from "node:assert/strict";
import { AppointmentDeleteService } from "./appointment-delete.service.js";
import { AppointmentRequestError } from "./appointments.service.js";

const CLINIC = "clinic-1";
const OTHER_CLINIC = "clinic-2";
const APPT = {
  id: "appt-1",
  clinic_id: CLINIC,
  status: "completed",
  payment_status: "not_required",
};

function createDeps({
  appointment = APPT,
  invoices = [],
  scribeCount = 0,
  hardDeleteResult = { id: APPT.id },
} = {}) {
  const calls = {
    findByIdForClinic: [],
    listByAppointmentIds: [],
    deleteInvoicePdfs: [],
    deleteByAppointmentIds: [],
    hardDeleteByAppointmentId: [],
    hardDeleteById: [],
  };

  return {
    calls,
    service: new AppointmentDeleteService({
      appointmentRepository: {
        async findByIdForClinic(clinicId, appointmentId) {
          calls.findByIdForClinic.push({ clinicId, appointmentId });
          if (clinicId !== CLINIC || appointmentId !== appointment?.id) {
            return null;
          }
          return appointment;
        },
        async hardDeleteById(clinicId, appointmentId) {
          calls.hardDeleteById.push({ clinicId, appointmentId });
          if (clinicId !== CLINIC || appointmentId !== appointment?.id) {
            return null;
          }
          return hardDeleteResult;
        },
      },
      invoiceRepository: {
        async listByAppointmentIds(clinicId, appointmentIds) {
          calls.listByAppointmentIds.push({ clinicId, appointmentIds });
          return clinicId === CLINIC ? invoices : [];
        },
        async deleteByAppointmentIds(clinicId, appointmentIds) {
          calls.deleteByAppointmentIds.push({ clinicId, appointmentIds });
          return invoices.length;
        },
      },
      invoiceStorageService: {
        async deleteInvoicePdfs(paths) {
          calls.deleteInvoicePdfs.push(paths);
        },
      },
      scribeSessionRepository: {
        async countByAppointmentId(clinicId) {
          return clinicId === CLINIC ? scribeCount : 0;
        },
        async hardDeleteByAppointmentId(clinicId, appointmentId) {
          calls.hardDeleteByAppointmentId.push({ clinicId, appointmentId });
          return scribeCount;
        },
      },
    }),
  };
}

test("getDeletionImpact: lists invoices and scribe sessions to delete", async () => {
  const { service } = createDeps({
    invoices: [{ id: "inv-1", storage_path: "invoices/c/a.pdf" }],
    scribeCount: 2,
  });

  const impact = await service.getDeletionImpact(CLINIC, APPT.id);
  assert.equal(impact.bookingInvoices, 1);
  assert.equal(impact.scribeSessions, 2);
  assert.equal(impact.blocked, false);
});

test("hardDelete: cascades invoices → scribe_sessions → appointment", async () => {
  const invoices = [
    { id: "inv-1", storage_path: "invoices/clinic-1/appt-1.pdf" },
  ];
  const { service, calls } = createDeps({
    appointment: { ...APPT, status: "cancelled", payment_status: "refunded" },
    invoices,
    scribeCount: 1,
  });

  const result = await service.hardDelete(CLINIC, APPT.id);

  assert.equal(result.deleted, true);
  assert.deepEqual(calls.deleteInvoicePdfs[0], [
    "invoices/clinic-1/appt-1.pdf",
  ]);
  assert.deepEqual(calls.deleteByAppointmentIds[0].appointmentIds, ["appt-1"]);
  assert.deepEqual(calls.hardDeleteByAppointmentId[0], {
    clinicId: CLINIC,
    appointmentId: APPT.id,
  });
  assert.deepEqual(calls.hardDeleteById[0], {
    clinicId: CLINIC,
    appointmentId: APPT.id,
  });
});

test("hardDelete: allows CONFIRMED / CANCELLED / COMPLETED when not paid-unrefunded", async () => {
  for (const status of ["confirmed", "cancelled", "completed"]) {
    const { service } = createDeps({
      appointment: { ...APPT, status, payment_status: "not_required" },
    });
    const result = await service.hardDelete(CLINIC, APPT.id);
    assert.equal(result.deleted, true, `status=${status}`);
  }
});

test("hardDelete: refuses paid unrefunded appointment (no Razorpay refund)", async () => {
  const { service, calls } = createDeps({
    appointment: { ...APPT, payment_status: "paid" },
    invoices: [{ id: "inv-1", storage_path: "path.pdf" }],
  });

  await assert.rejects(
    () => service.hardDelete(CLINIC, APPT.id),
    (err) =>
      err instanceof AppointmentRequestError &&
      err.statusCode === 409 &&
      /Cancel/i.test(err.message),
  );
  assert.equal(calls.deleteByAppointmentIds.length, 0);
  assert.equal(calls.hardDeleteById.length, 0);
});

test("hardDelete: clinic scoping — cannot delete another clinic's appointment", async () => {
  const { service, calls } = createDeps();

  await assert.rejects(
    () => service.hardDelete(OTHER_CLINIC, APPT.id),
    (err) => err instanceof AppointmentRequestError && err.statusCode === 404,
  );
  assert.equal(calls.hardDeleteById.length, 0);
});
