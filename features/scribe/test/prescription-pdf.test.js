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
  assert.equal(display.credentialLine, "General Physician");
  assert.equal(display.registrationNumber, "MCI-123456");
  assert.equal(display.patientName, "Asha Kumar");
  assert.equal(display.ageSex, "34 yr");
  assert.equal(display.consultationDateLabel, "22 Jul 2026");
  assert.match(display.registrationLine, /Reg\. No: MCI-123456/);
  assert.match(display.padText, /Age\/Sex: 34 yr/);
  assert.match(display.padText, /Weight: ____ kg/);
  assert.match(display.padText, /SpO2: ____ %/);
  assert.match(display.padText, /Heart Rate: ____ bpm/);
  assert.equal(display.medicines.length, 2);
  assert.equal(display.medicines[0].name, "Amoxicillin");
  assert.equal(display.medicines[0].dose, "500mg");
  assert.equal(display.medicines[0].frequency, "1-0-1");
  assert.equal(display.medicines[0].duration, "5 days");
  assert.equal(display.medicines[0].instructions, "After food");
  assert.deepEqual(display.diagnosis, ["Acute pharyngitis"]);
  assert.match(display.advice, /Warm saline/i);
  assert.match(display.followUp, /Follow up/i);
  assert.match(display.signatureName, /Dr\. Rao/);
  assert.match(display.disclaimer, /Nadi AI/i);
  assert.match(display.disclaimer, /doctor's signature/i);
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
  assert.equal(display.medicines[0].detail, "500mg · OD · 3 days · PRN");
  assert.deepEqual(display.diagnosis, ["Fever"]);
  assert.match(display.advice, /Rest well/);
});

test("buildPrescriptionDisplayFields: missing licence and vitals stay blank", () => {
  const display = buildPrescriptionDisplayFields({
    ...BASE_FIELDS,
    clinicAddress: null,
    clinicPhone: null,
    specialization: null,
    registrationNumber: null,
    patientAge: 99,
    patientDob: null,
    patientGender: "female",
    objective: "Not documented in transcript.",
    vitals: { weightKg: 70, spo2: 99, heartRate: 80, bp: "120/80", temperature: "98.6" },
    draft: { medications: [], diagnosis: [], advice: [], warnings: [], investigations: [] },
  });
  assert.equal(display.clinicAddress, "");
  assert.equal(display.clinicPhone, "");
  assert.equal(display.credentialLine, "");
  assert.equal(display.registrationLine, "Reg. No: ________");
  assert.match(display.padText, /Reg\. No: ________/);
  assert.equal(display.ageSex, "____ / F");
  assert.doesNotMatch(display.padText, /99 yr/);
  assert.match(display.padText, /Weight: ____ kg/);
  assert.match(display.padText, /SpO2: ____ %/);
  assert.match(display.padText, /Heart Rate: ____ bpm/);
  assert.doesNotMatch(display.vitalRow.join(" "), /120\/80|98\.6|70 kg|99 %|80 bpm/);
  assert.equal(display.medicines.length, 0);
  assert.equal(display.diagnosis.length, 0);
});

test("buildPrescriptionDisplayFields: keeps duration ranges and prints documented vitals", () => {
  const display = buildPrescriptionDisplayFields({
    ...BASE_FIELDS,
    patientGender: "male",
    dobIsApproximate: true,
    objective: "Vitals: BP: 120/80 mmHg, HR: 88 bpm, Temp: 99 °F, SpO2: 97%, Weight: 62 kg",
    draft: {
      ...BASE_DRAFT,
      medications: [
        {
          name: "Paracetamol",
          dosage: "10 ml",
          frequency: "TID",
          duration: "3-4 days",
          instructions: "After food",
        },
      ],
    },
  });
  assert.equal(display.ageSex, "34 yr / M");
  assert.doesNotMatch(display.ageSex, /approx|~/i);
  assert.equal(display.medicines[0].duration, "3-4 days");
  assert.equal(display.medicines[0].detail, "10 ml · TID · 3-4 days · After food");
  assert.match(display.padText, /Weight: 62 kg/);
  assert.match(display.padText, /SpO2: 97 %/);
  assert.match(display.padText, /Heart Rate: 88 bpm/);
  assert.match(display.padText, /BP: 120\/80/);
  assert.match(display.padText, /Temp: 99/);
});

test("generatePrescriptionPdf: produces a valid PDF loadable by pdf-lib", async () => {
  const bytes = await generatePrescriptionPdf(BASE_FIELDS);
  assert.ok(bytes instanceof Uint8Array);
  assert.ok(bytes.length > 500);
  assert.equal(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]), "%PDF");

  const loaded = await PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), 1);
});

test("generatePrescriptionPdf: 10 and 14 medicines paginate", async () => {
  const medicines = Array.from({ length: 14 }, (_, i) => ({
    name: `Medicine ${i + 1}`,
    dosage: "500mg",
    frequency: "1-0-1",
    duration: "3-4 days",
    instructions: "After food",
  }));
  const ten = await generatePrescriptionPdf({
    ...BASE_FIELDS,
    draft: { ...BASE_DRAFT, medications: medicines.slice(0, 10) },
  });
  const fourteen = await generatePrescriptionPdf({
    ...BASE_FIELDS,
    draft: { ...BASE_DRAFT, medications: medicines },
  });
  assert.ok((await PDFDocument.load(ten)).getPageCount() >= 2);
  assert.ok((await PDFDocument.load(fourteen)).getPageCount() >= 2);
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
