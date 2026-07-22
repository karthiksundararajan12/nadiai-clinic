import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  buildInvoiceDisplayFields,
  formatInvoiceNumber,
  generateInvoicePdf,
} from "../lib/invoice-pdf.js";

const BASE_FIELDS = {
  clinicName: "Nadi Care Clinic",
  clinicAddress: "12 MG Road, Bengaluru",
  doctorName: "Dr. Rao",
  patientName: "Asha Kumar",
  slotStart: "2026-07-06T03:30:00.000Z", // Mon 6 Jul, 9:00 AM IST
  consultationAmount: 500,
  razorpayPaymentId: "pay_ABC123",
  invoiceNumber: "INV-000042",
};

test("formatInvoiceNumber: pads sequential numbers per clinic", () => {
  assert.equal(formatInvoiceNumber(1), "INV-000001");
  assert.equal(formatInvoiceNumber(42), "INV-000042");
  assert.equal(formatInvoiceNumber(1000001), "INV-1000001");
});

test("formatInvoiceNumber: rejects non-positive sequences", () => {
  assert.throws(() => formatInvoiceNumber(0));
  assert.throws(() => formatInvoiceNumber(-1));
});

test("buildInvoiceDisplayFields: maps all required invoice fields and leaves GST as NA", () => {
  const display = buildInvoiceDisplayFields(BASE_FIELDS);

  assert.equal(display.invoiceNumber, "INV-000042");
  assert.equal(display.clinicName, "Nadi Care Clinic");
  assert.equal(display.clinicAddress, "12 MG Road, Bengaluru");
  assert.equal(display.doctorName, "Dr. Rao");
  assert.equal(display.patientName, "Asha Kumar");
  assert.equal(display.appointmentDateTime, "Mon 6 Jul, 9:00 AM");
  assert.equal(display.consultationAmount, "INR 500.00");
  assert.equal(display.razorpayPaymentId, "pay_ABC123");
  assert.equal(display.gstin, "NA");
  assert.equal(display.cgst, "NA");
  assert.equal(display.sgst, "NA");
});

test("buildInvoiceDisplayFields: does not invent a GSTIN when address/amount missing", () => {
  const display = buildInvoiceDisplayFields({
    ...BASE_FIELDS,
    clinicAddress: null,
    consultationAmount: null,
  });
  assert.equal(display.clinicAddress, "NA");
  assert.equal(display.consultationAmount, "NA");
  assert.equal(display.gstin, "NA");
  assert.equal(display.gstin.includes("29"), false);
});

test("generateInvoicePdf: produces a valid PDF loadable by pdf-lib", async () => {
  const bytes = await generateInvoicePdf(BASE_FIELDS);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500);
  assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), "%PDF");

  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), 1);
});
