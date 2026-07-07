"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrescriptionPlainText } from "../../lib/prescription-format.js";
import { downloadPrescriptionPdf } from "../../services/prescription-export.client.js";

export function PrescriptionApprovedView({ draft, patient, doctor }) {
  const [copying, setCopying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    setCopying(true);
    try {
      const text = formatPrescriptionPlainText({ draft, patient, doctor });
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } finally {
      setCopying(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await downloadPrescriptionPdf({ draft, patient, doctor });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center" data-testid="prescription-approved">
      <CheckCircle2 className="h-14 w-14 text-green-600" />
      <p className="text-lg font-semibold text-gray-900">Prescription Approved</p>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full cursor-pointer gap-2"
          onClick={handleCopy}
          disabled={copying}
        >
          {copying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy to Clipboard"}
        </Button>
        <Button
          type="button"
          className="w-full cursor-pointer gap-2 bg-cyan-600 hover:bg-cyan-700"
          onClick={handleDownload}
          disabled={downloading}
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download PDF
        </Button>
      </div>
    </div>
  );
}
