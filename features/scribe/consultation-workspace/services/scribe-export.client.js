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
  await printHtmlDocument(html);
  return { sessionId };
}

function printHtmlDocument(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "SOAP export");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);

    const frameWindow = iframe.contentWindow;
    const frameDoc = frameWindow?.document;
    if (!frameWindow || !frameDoc) {
      document.body.removeChild(iframe);
      reject(new Error("Could not open print preview."));
      return;
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      setTimeout(() => {
        if (iframe.parentNode) document.body.removeChild(iframe);
      }, 1000);
    };

    // onafterprint is unreliable (often skipped when the dialog is cancelled).
    const cleanupFallback = setTimeout(cleanup, 60_000);
    frameWindow.onafterprint = () => {
      clearTimeout(cleanupFallback);
      cleanup();
    };

    frameDoc.open();
    frameDoc.write(html);
    frameDoc.close();

    setTimeout(() => {
      try {
        frameWindow.focus();
        frameWindow.print();
        resolve();
      } catch (err) {
        clearTimeout(cleanupFallback);
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    }, 400);
  });
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
