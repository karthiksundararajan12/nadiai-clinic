import test from "node:test";
import assert from "node:assert/strict";
import { PaymentDeleteService } from "../services/payment-delete.service.js";
import { PaymentRequestError } from "../services/payments.service.js";

const CLINIC = "clinic-1";
const OTHER_CLINIC = "clinic-2";
const APPT = {
  id: "appt-1",
  clinic_id: CLINIC,
  payment_status: "paid",
  payment_amount: 500,
  razorpay_payment_id: "pay_ABC",
  refund_status: null,
  refund_id: null,
  refunded_at: null,
};

function createDeps({
  appointment = APPT,
  invoices = [{ id: "inv-1", storage_path: "invoices/clinic-1/appt-1.pdf" }],
  clearResult = { ...APPT, payment_status: "not_required" },
} = {}) {
  const calls = {
    findByIdForClinic: [],
    listByAppointmentIds: [],
    deleteInvoicePdfs: [],
    deleteByAppointmentIds: [],
    clearPaymentFields: [],
  };

  return {
    calls,
    service: new PaymentDeleteService({
      appointmentRepository: {
        async findByIdForClinic(clinicId, appointmentId) {
          calls.findByIdForClinic.push({ clinicId, appointmentId });
          if (clinicId !== CLINIC || appointmentId !== appointment?.id) {
            return null;
          }
          return appointment;
        },
        async clearPaymentFields(clinicId, appointmentId) {
          calls.clearPaymentFields.push({ clinicId, appointmentId });
          if (clinicId !== CLINIC || appointmentId !== appointment?.id) {
            return null;
          }
          return clearResult;
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
    }),
  };
}

test("deletePaymentRecord: clears payment fields, deletes invoice + PDF, keeps appointment", async () => {
  const { service, calls } = createDeps();

  const result = await service.deletePaymentRecord(CLINIC, APPT.id);

  assert.equal(result.deleted, true);
  assert.equal(result.clearedPaymentFields, true);
  assert.equal(result.deletedBookingInvoices, 1);
  assert.deepEqual(calls.deleteInvoicePdfs[0], [
    "invoices/clinic-1/appt-1.pdf",
  ]);
  assert.deepEqual(calls.deleteByAppointmentIds[0].appointmentIds, ["appt-1"]);
  assert.deepEqual(calls.clearPaymentFields[0], {
    clinicId: CLINIC,
    appointmentId: APPT.id,
  });
  // Appointment row itself is not hard-deleted
  assert.ok(!("hardDeleteById" in calls));
});

test("deletePaymentRecord: clinic scoping — other clinic's payment is 404", async () => {
  const { service, calls } = createDeps();

  await assert.rejects(
    () => service.deletePaymentRecord(OTHER_CLINIC, APPT.id),
    (err) => err instanceof PaymentRequestError && err.statusCode === 404,
  );
  assert.equal(calls.clearPaymentFields.length, 0);
  assert.equal(calls.deleteByAppointmentIds.length, 0);
});

test("deletePaymentRecord: 404 when appointment has no payment accounting", async () => {
  const { service, calls } = createDeps({
    appointment: { ...APPT, payment_status: "not_required" },
  });

  await assert.rejects(
    () => service.deletePaymentRecord(CLINIC, APPT.id),
    (err) => err instanceof PaymentRequestError && err.statusCode === 404,
  );
  assert.equal(calls.clearPaymentFields.length, 0);
});

test("deletePaymentRecord: works when invoice row is already missing", async () => {
  const { service, calls } = createDeps({ invoices: [] });

  const result = await service.deletePaymentRecord(CLINIC, APPT.id);

  assert.equal(result.deleted, true);
  assert.equal(result.deletedBookingInvoices, 0);
  assert.deepEqual(calls.deleteInvoicePdfs[0], []);
  assert.equal(calls.clearPaymentFields.length, 1);
});
