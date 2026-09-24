/**
 * Writes sample prescription PDFs to /tmp for a visual check.
 *   node scripts/preview-rx-pdf.mjs
 */
import { writeFileSync } from "node:fs";
import "../test/register-mocks.mjs";

const { generatePrescriptionPdf } = await import("../features/scribe/lib/prescription-pdf.js");

const doctor = {
  clinicName: "Nadi Care Clinic",
  clinicAddress: "12 MG Road, Bengaluru 560001",
  clinicPhone: "+91 80 1234 5678",
  doctorName: "Dr. Ananya Mehta",
  qualifications: "MBBS, MD (General Medicine)",
  specialization: "General Physician",
  registrationNumber: "KMC-123456",
  patientName: "Asha Kumar",
  patientDob: "1992-04-15",
  dobIsApproximate: false,
  patientGender: "female",
  consultationDate: "2026-07-22T05:00:00.000Z",
  prescriptionNumber: "RX-000042",
};

const documented = {
  objective: "Vitals: BP: 118/76 mmHg, HR: 82 bpm, Temp: 98.6 °F, SpO2: 98%, Weight: 61 kg",
};

function medicines(count) {
  return Array.from({ length: count }, (_, index) => ({
    name: index % 2 === 0 ? "Amoxicillin" : "Paracetamol",
    dosage: index % 2 === 0 ? "500mg" : "10 ml",
    frequency: index % 2 === 0 ? "1-0-1" : "TID",
    duration: "3-4 days",
    instructions: "After food",
  }));
}

function draft(count) {
  return {
    diagnosis: ["Acute pharyngitis"],
    complaints: "Sore throat for 2 days",
    medications: medicines(count),
    advice: ["Warm saline gargles", "Rest"],
    followUpInstructions: "12 Aug 2026",
    warnings: [],
    investigations: [],
  };
}

const samples = [
  ["rx-1-medicine.pdf", { ...doctor, ...documented, draft: draft(1) }],
  ["rx-6-medicines.pdf", { ...doctor, ...documented, draft: draft(6) }],
  ["rx-14-medicines.pdf", { ...doctor, ...documented, draft: draft(14) }],
  ["rx-empty-vitals.pdf", {
    ...doctor,
    registrationNumber: null,
    objective: "Not documented in transcript.",
    vitals: { weightKg: 70, spo2: 99, heartRate: 80, bp: "120/80", temperature: "99" },
    draft: draft(1),
  }],
];

for (const [filename, fields] of samples) {
  const bytes = await generatePrescriptionPdf(fields);
  const path = `/tmp/${filename}`;
  writeFileSync(path, bytes);
  console.log(`${path} (${bytes.length} bytes)`);
}
