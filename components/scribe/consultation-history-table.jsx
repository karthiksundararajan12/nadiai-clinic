"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ClipboardList,
  FileText,
  History,
  Pill,
  ScrollText,
  Shield,
} from "lucide-react";

/**
 * @param {{
 *   consultations: Array<Record<string, unknown>>;
 *   busySessionId?: string | null;
 *   onViewTranscript?: (id: string) => void;
 *   onViewSOAP?: (id: string) => void;
 *   onViewVersions?: (id: string) => void;
 *   onViewAudit?: (id: string) => void;
 *   onViewPrescription?: (id: string) => void;
 *   onExportPdf?: (id: string) => void;
 * }} props
 */
export function ConsultationHistoryTable({
  consultations,
  busySessionId,
  onViewTranscript,
  onViewSOAP,
  onViewVersions,
  onViewAudit,
  onViewPrescription,
  onExportPdf,
}) {
  if (!consultations?.length) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No consultations in this list yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Patient</th>
            <th className="px-3 py-2 font-medium">Doctor</th>
            <th className="px-3 py-2 font-medium">Session</th>
            <th className="px-3 py-2 font-medium">Transcript</th>
            <th className="px-3 py-2 font-medium">SOAP</th>
            <th className="px-3 py-2 font-medium">Rx</th>
            <th className="px-3 py-2 font-medium">Approval</th>
            <th className="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {consultations.map((row) => (
            <ConsultationHistoryRow
              key={row.id}
              row={row}
              busy={busySessionId === row.id}
              onViewTranscript={onViewTranscript}
              onViewSOAP={onViewSOAP}
              onViewVersions={onViewVersions}
              onViewAudit={onViewAudit}
              onViewPrescription={onViewPrescription}
              onExportPdf={onExportPdf}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConsultationHistoryRow({
  row,
  busy,
  onViewTranscript,
  onViewSOAP,
  onViewVersions,
  onViewAudit,
  onViewPrescription,
  onExportPdf,
}) {
  const date = new Date(row.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const canTranscript = ["ready", "completed"].includes(row.transcript_status);
  const canSoap = row.has_soap;
  const canRx = row.prescription_status && row.prescription_status !== "not_generated";

  return (
    <tr className="border-b last:border-0 hover:bg-muted/20">
      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{date}</td>
      <td className="px-3 py-2">{row.patient_name}</td>
      <td className="px-3 py-2">{row.doctor_name}</td>
      <td className="px-3 py-2 font-mono text-xs">{String(row.id).slice(0, 8)}…</td>
      <td className="px-3 py-2">
        <StatusPill label={row.transcript_status} />
      </td>
      <td className="px-3 py-2">
        <StatusPill label={row.soap_status} />
      </td>
      <td className="px-3 py-2">
        <StatusPill label={row.prescription_status} />
      </td>
      <td className="px-3 py-2">
        <StatusPill label={row.approval_status} />
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap justify-end gap-1">
          {canTranscript && (
            <ActionButton
              icon={ClipboardList}
              label="Transcript"
              disabled={busy}
              onClick={() => onViewTranscript?.(row.id)}
            />
          )}
          {canSoap && (
            <ActionButton
              icon={FileText}
              label="SOAP"
              disabled={busy}
              onClick={() => onViewSOAP?.(row.id)}
            />
          )}
          {canSoap && (
            <ActionButton
              icon={History}
              label="Versions"
              disabled={busy}
              onClick={() => onViewVersions?.(row.id)}
            />
          )}
          <ActionButton
            icon={Shield}
            label="Audit"
            disabled={busy}
            onClick={() => onViewAudit?.(row.id)}
          />
          {canRx && (
            <ActionButton
              icon={Pill}
              label="Rx"
              disabled={busy}
              onClick={() => onViewPrescription?.(row.id)}
            />
          )}
          {canSoap && (
            <ActionButton
              icon={ScrollText}
              label="PDF"
              disabled={busy}
              onClick={() => onExportPdf?.(row.id)}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

function StatusPill({ label }) {
  return (
    <Badge variant="outline" className="text-xs font-normal capitalize">
      {String(label ?? "—").replace(/_/g, " ")}
    </Badge>
  );
}

function ActionButton({ icon: Icon, label, disabled, onClick, title }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1 px-2 text-xs"
      disabled={disabled}
      title={title ?? label}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
