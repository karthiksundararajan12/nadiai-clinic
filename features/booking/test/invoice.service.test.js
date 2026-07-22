import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { InvoiceService } from "../services/invoice.service.js";
import { sendInvoiceDocument } from "../services/invoice-whatsapp.js";
import { INVOICE_WHATSAPP_TEMPLATE_NAME } from "../constants.js";

const CLINIC = {
  id: "clinic-1",
  name: "Nadi Care Clinic",
  address: "12 MG Road",
  whatsapp_phone_number_id: "PNID_1",
};
const PATIENT = { id: "patient-1", full_name: "Asha Kumar" };
const DOCTOR = { id: "doctor-1", full_name: "Dr. Rao" };
const APPOINTMENT = {
  id: "appt-1",
  patient_id: "patient-1",
  contact_phone: "919876543210",
  slot_start: "2026-07-06T03:30:00.000Z",
  payment_amount: 500,
};

function makeDeps({ existingInvoice = null } = {}) {
  const allocateCalls = [];
  const insertCalls = [];
  const uploadCalls = [];
  const sendCalls = [];

  const invoiceRepo = {
    async findByAppointment() {
      return existingInvoice;
    },
    async allocateNextNumber(clinicId) {
      allocateCalls.push(clinicId);
      return { invoiceSeq: 7, invoiceNumber: "INV-000007" };
    },
    async insert(row) {
      insertCalls.push(row);
      return { id: "inv-1", ...row };
    },
  };

  const invoiceStorage = {
    async uploadInvoicePdf(params) {
      uploadCalls.push(params);
      // Validate PDF bytes are real
      const loaded = await PDFDocument.load(params.pdfBytes);
      assert.equal(loaded.getPageCount(), 1);
      return {
        storagePath: `invoices/${params.clinicId}/${params.appointmentId}.pdf`,
        pdfUrl: `https://storage.example/invoices/${params.clinicId}/${params.appointmentId}.pdf?sig=1`,
      };
    },
    async createSignedUrl(storagePath) {
      return `https://storage.example/${storagePath}?sig=reuse`;
    },
  };

  const clinicRepo = { async findById() { return CLINIC; } };
  const patientRepo = {
    async findById(clinicId, patientId) {
      assert.equal(clinicId, "clinic-1");
      assert.equal(patientId, "patient-1");
      return PATIENT;
    },
  };
  const doctorRepo = {
    async findPrimaryByClinicId(clinicId) {
      assert.equal(clinicId, "clinic-1");
      return DOCTOR;
    },
  };

  async function sendFn(phoneNumberId, patientPhone, pdfUrl) {
    sendCalls.push({ phoneNumberId, patientPhone, pdfUrl });
    return { stubbed: true, templateName: INVOICE_WHATSAPP_TEMPLATE_NAME };
  }

  const service = new InvoiceService(
    invoiceRepo,
    invoiceStorage,
    clinicRepo,
    patientRepo,
    doctorRepo,
    { sendInvoiceDocument: sendFn },
  );

  return { service, allocateCalls, insertCalls, uploadCalls, sendCalls };
}

test("InvoiceService.deliverForConfirmedAppointment: generates PDF, uploads, records ledger, stubs WhatsApp send", async () => {
  const { service, allocateCalls, insertCalls, uploadCalls, sendCalls } = makeDeps();

  const result = await service.deliverForConfirmedAppointment({
    clinicId: "clinic-1",
    appointment: APPOINTMENT,
    razorpayPaymentId: "pay_1",
  });

  assert.equal(result.invoiceNumber, "INV-000007");
  assert.equal(result.storagePath, "invoices/clinic-1/appt-1.pdf");
  assert.equal(result.reused, false);
  assert.deepEqual(allocateCalls, ["clinic-1"]);
  assert.equal(uploadCalls.length, 1);
  assert.equal(insertCalls.length, 1);
  assert.equal(insertCalls[0].invoiceNumber, "INV-000007");
  assert.equal(insertCalls[0].razorpayPaymentId, "pay_1");
  assert.equal(insertCalls[0].amount, 500);
  assert.deepEqual(sendCalls[0], {
    phoneNumberId: "PNID_1",
    patientPhone: "919876543210",
    pdfUrl: "https://storage.example/invoices/clinic-1/appt-1.pdf?sig=1",
  });
});

test("InvoiceService.deliverForConfirmedAppointment: reuses existing invoice without allocating a new number", async () => {
  const { service, allocateCalls, insertCalls, sendCalls } = makeDeps({
    existingInvoice: {
      invoice_number: "INV-000003",
      storage_path: "invoices/clinic-1/appt-1.pdf",
      razorpay_payment_id: "pay_old",
    },
  });

  const result = await service.deliverForConfirmedAppointment({
    clinicId: "clinic-1",
    appointment: APPOINTMENT,
    razorpayPaymentId: "pay_1",
  });

  assert.equal(result.reused, true);
  assert.equal(result.invoiceNumber, "INV-000003");
  assert.equal(allocateCalls.length, 0);
  assert.equal(insertCalls.length, 0);
  assert.equal(sendCalls[0].pdfUrl, "https://storage.example/invoices/clinic-1/appt-1.pdf?sig=reuse");
});

test("sendInvoiceDocument: stub returns stubbed:true and does not throw", async () => {
  const result = await sendInvoiceDocument("PNID", "9198", "https://example.com/a.pdf");
  assert.equal(result.stubbed, true);
  assert.equal(result.templateName, INVOICE_WHATSAPP_TEMPLATE_NAME);
});
