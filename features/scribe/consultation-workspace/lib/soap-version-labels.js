import { SOAP_VERSION_SOURCE_LABELS } from "../../constants.js";

/**
 * @param {import("../../repository/soap.repository.js").SoapNoteVersion | Record<string, unknown>} version
 */
export function resolveSoapVersionLabel(version) {
  if (!version) return "Unknown";
  const custom = version.diff_metadata?.label;
  if (typeof custom === "string" && custom.trim()) return custom;
  const workflowSource = version.diff_metadata?.workflow_source;
  if (typeof workflowSource === "string" && SOAP_VERSION_SOURCE_LABELS[workflowSource]) {
    return `Version ${version.version_number} (${SOAP_VERSION_SOURCE_LABELS[workflowSource]})`;
  }
  const source = version.source ?? "ai_generated";
  const base = SOAP_VERSION_SOURCE_LABELS[source] ?? source.replace(/_/g, " ");
  return `Version ${version.version_number} (${base})`;
}
