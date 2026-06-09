"use client";

export async function sendPrescriptionViaWhatsApp({ patientPhone, prescriptionData, sessionId }) {
  const res = await fetch("/api/whatsapp/send-prescription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientPhone, prescriptionData, sessionId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `WhatsApp send failed (${res.status})`);
  return payload;
}
