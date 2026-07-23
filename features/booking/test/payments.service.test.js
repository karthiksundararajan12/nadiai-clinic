import test from "node:test";
import assert from "node:assert/strict";
import {
  paymentStatusFilterToDb,
  resolvePaymentDateRange,
  formatPaymentStatusLabel,
  escapeIlikePattern,
} from "../lib/payment-list.js";
import { PaymentsService } from "../services/payments.service.js";

test("paymentStatusFilterToDb maps captured → paid", () => {
  assert.equal(paymentStatusFilterToDb("captured"), "paid");
  assert.equal(paymentStatusFilterToDb("paid"), "paid");
  assert.equal(paymentStatusFilterToDb("failed"), "failed");
  assert.equal(paymentStatusFilterToDb("refunded"), "refunded");
  assert.equal(paymentStatusFilterToDb("all"), null);
  assert.equal(paymentStatusFilterToDb(null), null);
});

test("formatPaymentStatusLabel uses product term Captured for paid", () => {
  assert.equal(formatPaymentStatusLabel("paid"), "Captured");
  assert.equal(formatPaymentStatusLabel("failed"), "Failed");
});

test("escapeIlikePattern escapes % and _", () => {
  assert.equal(escapeIlikePattern("a%b_c"), "a\\%b\\_c");
});

test("resolvePaymentDateRange today returns IST day bounds", () => {
  const now = new Date("2026-07-23T08:00:00.000Z"); // 13:30 IST
  const { fromIso, toIso } = resolvePaymentDateRange("today", { now });
  assert.equal(fromIso, new Date("2026-07-23T00:00:00+05:30").toISOString());
  assert.equal(toIso, new Date("2026-07-23T23:59:59.999+05:30").toISOString());
});

test("resolvePaymentDateRange custom uses from/to YMD", () => {
  const { fromIso, toIso } = resolvePaymentDateRange("custom", {
    from: "2026-07-01",
    to: "2026-07-15",
  });
  assert.equal(fromIso, new Date("2026-07-01T00:00:00+05:30").toISOString());
  assert.equal(toIso, new Date("2026-07-15T23:59:59.999+05:30").toISOString());
});

function createFakePaymentRepo(calls) {
  return {
    async listForClinic(clinicId, filters) {
      calls.push({ clinicId, filters });
      return {
        rows: [
          {
            id: "appt-1",
            appointment_id: "appt-1",
            patient_id: "patient-1",
            patient_name: "Karthik",
            slot_start: "2026-07-23T04:30:00.000Z",
            slot_end: "2026-07-23T05:00:00.000Z",
            amount: 799,
            payment_status: "paid",
            razorpay_payment_id: "pay_ABC",
            invoice_number: "INV-000002",
            invoice_storage_path: "invoices/clinic-1/appt-1.pdf",
            created_at: "2026-07-23T03:30:36.586Z",
          },
        ],
        total: 1,
      };
    },
  };
}

test("PaymentsService.list maps rows and composes search+status+range filters", async () => {
  const calls = [];
  const service = new PaymentsService(createFakePaymentRepo(calls));
  const result = await service.list("clinic-1", {
    search: "Karthik",
    status: "captured",
    range: "month",
    limit: 20,
    offset: 0,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].clinicId, "clinic-1");
  assert.equal(calls[0].filters.search, "Karthik");
  assert.equal(calls[0].filters.status, "captured");
  assert.ok(calls[0].filters.fromIso);
  assert.ok(calls[0].filters.toIso);

  assert.equal(result.total, 1);
  assert.equal(result.payments[0].patientName, "Karthik");
  assert.equal(result.payments[0].paymentStatusLabel, "Captured");
  assert.equal(result.payments[0].invoiceNumber, "INV-000002");
  assert.equal(result.payments[0].hasInvoicePdf, true);
  assert.equal(result.payments[0].razorpayPaymentId, "pay_ABC");
  assert.equal(result.hasMore, false);
});
