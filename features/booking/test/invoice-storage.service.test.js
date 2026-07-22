import test from "node:test";
import assert from "node:assert/strict";
import { InvoiceStorageService } from "../services/invoice-storage.service.js";
import { INVOICE_STORAGE } from "../constants.js";

function createFakeSupabaseStorage({ failUpload = false, failSign = false } = {}) {
  const uploads = [];
  const signed = [];

  const bucketApi = {
    async upload(path, body, opts) {
      uploads.push({ path, body, opts });
      if (failUpload) return { data: null, error: { message: "upload failed" } };
      return { data: { path }, error: null };
    },
    async createSignedUrl(path, expiresIn) {
      signed.push({ path, expiresIn });
      if (failSign) return { data: null, error: { message: "sign failed" } };
      return {
        data: { signedUrl: `https://storage.example/signed/${path}?token=abc` },
        error: null,
      };
    },
  };

  return {
    uploads,
    signed,
    storage: {
      from(bucket) {
        assert.equal(bucket, INVOICE_STORAGE.BUCKET);
        return bucketApi;
      },
    },
  };
}

test("INVOICE_STORAGE.buildPath: per-clinic appointment path", () => {
  assert.equal(
    INVOICE_STORAGE.buildPath("clinic-1", "appt-1"),
    "invoices/clinic-1/appt-1.pdf",
  );
});

test("InvoiceStorageService.uploadInvoicePdf: uploads PDF and returns signed URL", async () => {
  const fake = createFakeSupabaseStorage();
  const service = new InvoiceStorageService(fake);
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

  const result = await service.uploadInvoicePdf({
    clinicId: "clinic-1",
    appointmentId: "appt-1",
    pdfBytes,
  });

  assert.equal(result.storagePath, "invoices/clinic-1/appt-1.pdf");
  assert.equal(result.pdfUrl, "https://storage.example/signed/invoices/clinic-1/appt-1.pdf?token=abc");
  assert.equal(fake.uploads.length, 1);
  assert.equal(fake.uploads[0].path, "invoices/clinic-1/appt-1.pdf");
  assert.equal(fake.uploads[0].opts.contentType, "application/pdf");
  assert.equal(fake.uploads[0].opts.upsert, true);
  assert.deepEqual(fake.uploads[0].body, pdfBytes);
  assert.equal(fake.signed.length, 1);
  assert.equal(fake.signed[0].expiresIn, INVOICE_STORAGE.SIGNED_URL_TTL_SECONDS);
});

test("InvoiceStorageService.uploadInvoicePdf: throws on storage upload failure", async () => {
  const fake = createFakeSupabaseStorage({ failUpload: true });
  const service = new InvoiceStorageService(fake);

  await assert.rejects(
    () =>
      service.uploadInvoicePdf({
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        pdfBytes: new Uint8Array([1, 2, 3]),
      }),
    (err) => err.code === "DATABASE_ERROR",
  );
});
