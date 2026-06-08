/**
 * Client-side SOAP export — opens print dialog for PDF save.
 */

export async function exportSoapAsPdf(sessionId) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}/export?format=html`);
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload?.error || `Export failed (${res.status})`);
  }

  const html = await res.text();
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!printWindow) {
    throw new Error("Pop-up blocked. Allow pop-ups to export PDF.");
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  printWindow.onload = () => {
    printWindow.print();
  };

  return { sessionId };
}

export async function logSessionEvent(sessionId, action, metadata = {}) {
  await fetch(`/api/scribe/sessions/${sessionId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...metadata }),
  });
}

export async function fetchSessionStatus(sessionId) {
  const res = await fetch(`/api/scribe/sessions/${sessionId}`);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `Failed to load session (${res.status})`);
  return payload;
}
