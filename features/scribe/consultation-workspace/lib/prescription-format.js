/**
 * Plain-text formatting for prescription clipboard copy.
 */

/**
 * @param {object} params
 * @param {Record<string, unknown>} params.draft
 * @param {Record<string, unknown>|null} [params.patient]
 * @param {Record<string, unknown>|null} [params.doctor]
 */
export function formatPrescriptionPlainText({ draft, patient, doctor }) {
  const lines = [];
  const clinic = doctor?.clinic_name ?? "Clinic";
  const doctorName = doctor?.full_name ?? "Doctor";

  lines.push(clinic);
  lines.push(`Dr. ${doctorName}`);
  lines.push("");

  const patientName = patient?.name ?? "Patient";
  const age = patient?.age != null ? `${patient.age}yr` : "";
  const gender = patient?.gender ?? "";
  lines.push(`Patient: ${patientName}${age ? `, ${age}` : ""}${gender ? `, ${gender}` : ""}`);
  lines.push(`Date: ${new Date().toLocaleDateString("en-IN")}`);
  lines.push("");
  lines.push("Rx");

  const meds = draft?.medications ?? [];
  meds.forEach((med, i) => {
    lines.push(`${i + 1}. ${med.name}`);
    lines.push(`   Dose: ${med.dosage}`);
    lines.push(`   Frequency: ${med.frequency}`);
    lines.push(`   Duration: ${med.duration}`);
    if (med.instructions) lines.push(`   ${med.instructions}`);
    lines.push("");
  });

  const advice = draft?.advice ?? [];
  if (advice.length) {
    lines.push("Advice:");
    for (const item of advice) lines.push(`- ${item}`);
    lines.push("");
  }

  const followUpDays = draft?.followUpDays;
  if (followUpDays) {
    lines.push(`Follow-up in ${followUpDays} days`);
  } else if (draft?.followUpInstructions) {
    lines.push(draft.followUpInstructions);
  }

  lines.push("");
  lines.push("_________________________");
  lines.push(`Dr. ${doctorName}`);

  return lines.join("\n");
}

/**
 * @param {object} params
 */
export function buildPrescriptionPrintHtml({ draft, patient, doctor }) {
  const text = formatPrescriptionPlainText({ draft, patient, doctor });
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Prescription</title>
  <style>
    body { font-family: Georgia, serif; max-width: 640px; margin: 40px auto; padding: 0 24px; line-height: 1.6; color: #111; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>${escaped}</body>
</html>`;
}
