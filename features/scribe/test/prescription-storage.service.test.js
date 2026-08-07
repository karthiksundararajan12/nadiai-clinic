import test from "node:test";
import assert from "node:assert/strict";
import { PrescriptionStorageService } from "../services/prescription-storage.service.js";
import { PRESCRIPTION_STORAGE } from "../constants.js";

function createFakeSupabaseStorage({ failUpload = false } = {}) {
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
        assert.equal(bucket, PRESCRIPTION_STORAGE.BUCKET);
        return bucketApi;
      },
    },
  };
}

test("PRESCRIPTION_STORAGE.buildPath: clinic/appointment path", () => {
  assert.equal(
    PRESCRIPTION_STORAGE.buildPath("clinic-1", "appt-1"),
    "clinic-1/appt-1.pdf",
  );
});

test("PrescriptionStorageService.uploadPrescriptionPdf: uploads PDF and returns signed URL", async () => {
  const fake = createFakeSupabaseStorage();
  const service = new PrescriptionStorageService(fake);
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  const result = await service.uploadPrescriptionPdf({
    clinicId: "clinic-1",
    appointmentId: "appt-1",
    pdfBytes,
  });

  assert.equal(result.storagePath, "clinic-1/appt-1.pdf");
  assert.equal(fake.uploads[0].opts.contentType, "application/pdf");
  assert.equal(fake.uploads[0].opts.upsert, true);
  assert.equal(fake.signed[0].expiresIn, PRESCRIPTION_STORAGE.SIGNED_URL_TTL_SECONDS);
});

test("PrescriptionStorageService.uploadPrescriptionPdf: throws on storage upload failure", async () => {
  const fake = createFakeSupabaseStorage({ failUpload: true });
  const service = new PrescriptionStorageService(fake);
  await assert.rejects(
    () =>
      service.uploadPrescriptionPdf({
        clinicId: "clinic-1",
        appointmentId: "appt-1",
        pdfBytes: new Uint8Array([1, 2, 3]),
      }),
    (err) => err.code === "DATABASE_ERROR",
  );
});
