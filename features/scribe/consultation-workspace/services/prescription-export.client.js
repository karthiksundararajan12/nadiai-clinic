"use client";

import { buildPrescriptionPrintHtml } from "../lib/prescription-format.js";

function printHtmlDocument(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "Prescription export");
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

export async function downloadPrescriptionPdf({ draft, patient, doctor }) {
  const html = buildPrescriptionPrintHtml({ draft, patient, doctor });
  await printHtmlDocument(html);
}
