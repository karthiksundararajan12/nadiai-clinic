import { SOAP_NOTE_STATUS } from "../constants.js";

/** Version sources allowed before migration 013. */
export const LEGACY_SOAP_VERSION_SOURCES = new Set([
  "ai_generated",
  "autosave",
  "manual_save",
  "approved",
  "rejected",
]);

/**
 * Maps workflow version sources to DB-safe values on older schemas.
 * @param {string} source
 */
export function toDbSoapVersionSource(source) {
  if (LEGACY_SOAP_VERSION_SOURCES.has(source)) return source;
  if (source === "regenerated" || source === "pre_regeneration") return "ai_generated";
  if (source === "doctor_edited") return "manual_save";
  return "manual_save";
}

/**
 * Persists doctor workflow state in generation_metadata when status columns are unavailable.
 * @param {Record<string, unknown>|null|undefined} metadata
 * @param {string} workflowAction
 */
export function withSoapWorkflowMetadata(metadata, workflowAction) {
  return {
    ...(metadata ?? {}),
    workflow_action: workflowAction,
  };
}

/**
 * DB-safe note status for upsert/update (migration 007 compatible).
 * @param {"generated"|"regenerated"|"doctor_edited"|"reviewing"} action
 */
export function toDbSoapNoteStatus(action) {
  switch (action) {
    case "regenerated":
    case "generated":
      return SOAP_NOTE_STATUS.REVIEW_REQUIRED;
    case "doctor_edited":
    case "reviewing":
      return SOAP_NOTE_STATUS.REVIEWING;
    default:
      return SOAP_NOTE_STATUS.REVIEW_REQUIRED;
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} note
 */
export function resolveSoapWorkflowAction(note) {
  const meta = note?.generation_metadata;
  if (meta && typeof meta === "object" && typeof meta.workflow_action === "string") {
    return meta.workflow_action;
  }
  if (note?.status === SOAP_NOTE_STATUS.REGENERATED) return "regenerated";
  if (note?.status === SOAP_NOTE_STATUS.EDITED) return "doctor_edited";
  if (note?.modification_summary?.doctor_edited) return "doctor_edited";
  return null;
}
