const STATUS_LABELS = {
  RECORDING: "Recording",
  UPLOADING: "Uploading",
  UPLOADED: "Upload Complete",
  TRANSCRIPTION_QUEUED: "Transcription Queued",
  TRANSCRIBING: "Transcribing",
  TRANSCRIBED: "Transcript Ready",
  REVIEWING: "Transcript Review",
  REVIEW_COMPLETED: "Review Complete",
  GENERATING_SOAP: "Generating SOAP",
  SOAP_READY: "SOAP Ready",
  SOAP_REVIEW_REQUIRED: "SOAP Review Required",
  SOAP_REVIEWING: "SOAP Review in Progress",
  SOAP_APPROVED: "SOAP Approved",
  COMPLETED: "Consultation Complete",
  TRANSCRIPTION_FAILED: "Transcription Failed",
  FAILED: "Failed",
};

export function formatConsultationStatus(status) {
  return STATUS_LABELS[status] ?? String(status ?? "In Progress").replace(/_/g, " ");
}

export function formatVisitType(patient) {
  return patient?.visit_type ?? patient?.condition ?? "Consultation";
}
