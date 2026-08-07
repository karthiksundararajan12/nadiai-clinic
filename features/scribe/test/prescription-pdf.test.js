import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  buildPrescriptionDisplayFields,
  formatPrescriptionNumber,
  generatePrescriptionPdf,
} from "../lib/prescription-pdf.js";

const BASE_DRAFT = {
  diagnosis: ["Acute pharyngitis"],
  medications: [
    {
      name: "Amoxicillin",
      dosage: "500mg",
      frequency: "1-0-1",
      duration: "5 days",
      instructions: "After food",
      confidence: 0.9,
    },
    {
      name: "Paracetamol",
      dosage: "650mg",
      frequency: "SOS",
      duration: "3 days",
      instructions: "",
      confidence: 0.8,
    },
  ],
  investigations: [],
  advice: ["Warm saline gargles"],
  followUpInstructions: "Follow up in 5 days if no improvement",
  warnings: ["Allergy check"],
};

const BASE_FIELDS = {
  clinicName: "Nadi Care Clinic",
  clinicAddress: "12 MG Road, Bengaluru",
  clinicPhone: "+91 80 1234 5678",
  doctorName: "Dr. Rao",
  specialization: "General Physician",
  registrationNumber: "MCI-123456",
  patientName: "Asha Kumar",
  patientAge: 34,
  patientDob: "1992-04-15",
  consultationDate: "2026-07-22T05:00:00.000Z",
  prescriptionNumber: "RX-000042",
  draft: BASE_DRAFT,
};

test("formatPrescriptionNumber: pads sequential numbers per clinic", () => {
  assert.equal(formatPrescriptionNumber(1), "RX-000001");
  assert.equal(formatPrescriptionNumber(42), "RX-000042");
  assert.equal(formatPrescriptionNumber(1000001), "RX-1000001");
});

test("formatPrescriptionNumber: rejects non-positive sequences", () => {
  assert.throws(() => formatPrescriptionNumber(0));
  assert.throws(() => formatPrescriptionNumber(-1));
});

test("buildPrescriptionDisplayFields: maps letterhead, patient, Rx rows, and notes", () => {
  const display = buildPrescriptionDisplayFields(BASE_FIELDS);

  assert.equal(display.prescriptionNumber, "RX-000042");
  assert.equal(display.clinicName, "Nadi Care Clinic");
  assert.equal(display.clinicAddress, "12 MG Road, Bengaluru");
  assert.equal(display.clinicPhone, "+91 80 1234 5678");
  assert.equal(display.doctorName, "Dr. Rao");
  assert.equal(display.specialization, "General Physician");
  assert.equal(display.registrationNumber, "MCI-123456");
  assert.equal(display.patientName, "Asha Kumar");
  assert.equal(display.ageDob, "34 yr · DOB 15 Apr 1992");
  assert.equal(display.consultationDateLabel, "22 Jul 2026");
  assert.equal(display.medicines.length, 2);
  assert.equal(display.medicines[0].name, "Amoxicillin");
  assert.equal(display.medicines[0].dose, "500mg");
  assert.equal(display.medicines[0].frequency, "1-0-1");
  assert.equal(display.medicines[0].duration, "5 days");
  assert.equal(display.medicines[0].instructions, "After food");
  assert.deepEqual(display.diagnosis, ["Acute pharyngitis"]);
  assert.ok(display.clinicalNotes.some((n) => /Warm saline/i.test(n)));
  assert.ok(display.clinicalNotes.some((n) => /Follow up/i.test(n)));
  assert.match(display.signatureLabel, /Dr\. Rao/);
  assert.match(display.generatedVia, /Nadi AI/i);
});

test("buildPrescriptionDisplayFields: accepts dose alias and medicines array", () => {
  const display = buildPrescriptionDisplayFields({
    ...BASE_FIELDS,
    draft: {
      medicines: [
        {
          name: "Crocin",
          dose: "500mg",
          frequency: "OD",
          duration: "3 days",
          instructions: "PRN",
        },
      ],
      diagnosis: "Fever",
      doctorNotes: "Rest well",
    },
  });
  assert.equal(display.medicines[0].dose, "500mg");
  assert.deepEqual(display.diagnosis, ["Fever"]);
  assert.ok(display.clinicalNotes.includes("Rest well"));
});

test("buildPrescriptionDisplayFields: missing optional fields become NA", () => {
  const display = buildPrescriptionDisplayFields({
    ...BASE_FIELDS,
    clinicAddress: null,
    clinicPhone: null,
    specialization: null,
    registrationNumber: null,
    patientAge: null,
    patientDob: null,
    draft: { medications: [], diagnosis: [], advice: [], warnings: [], investigations: [] },
  });
  assert.equal(display.clinicAddress, "NA");
  assert.equal(display.clinicPhone, "NA");
  assert.equal(display.specialization, "NA");
  assert.equal(display.registrationNumber, "NA");
  assert.equal(display.ageDob, "NA");
  assert.equal(display.medicines.length, 0);
  assert.equal(display.diagnosis.length, 0);
});

test("generatePrescriptionPdf: produces a valid PDF loadable by pdf-lib", async () => {
  const bytes = await generatePrescriptionPdf(BASE_FIELDS);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500);
  assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), "%PDF");

  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), 1);
});

test("generatePrescriptionPdf: empty medicines still produces a valid PDF", async () => {
  const bytes = await generatePrescriptionPdf({
    ...BASE_FIELDS,
    draft: {
      diagnosis: [],
      medications: [],
      investigations: [],
      advice: [],
      followUpInstructions: "",
      warnings: [],
    },
  });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), "%PDF");
  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), 1);
});
