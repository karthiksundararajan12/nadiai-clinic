/**
 * Maps consultation session records to color-coded status chips for the Sessions drawer.
 */

/** @typedef {"approved"|"pending_review"|"draft"|"rejected"} SessionChipStatus */

const CHIP_CONFIG = {
  approved: {
    label: "Approved",
    chip: "bg-green-100 text-green-700",
    dot: "bg-green-700",
  },
  pending_review: {
    label: "Pending Review",
    chip: "bg-yellow-100 text-yellow-700",
    dot: "bg-yellow-700",
  },
  draft: {
    label: "Draft",
    chip: "bg-gray-100 text-gray-600",
    dot: "bg-gray-600",
  },
  rejected: {
    label: "Rejected",
    chip: "bg-red-100 text-red-700",
    dot: "bg-red-700",
  },
};

/**
 * @param {{ status?: string; approval_status?: string; soap_status?: string }} session
 * @returns {{ status: SessionChipStatus; label: string; chip: string; dot: string }}
 */
export function resolveSessionChip(session) {
  const chipStatus = resolveSessionChipStatus(session);
  const config = CHIP_CONFIG[chipStatus];
  return { status: chipStatus, ...config };
}

/**
 * @param {{ status?: string; approval_status?: string; soap_status?: string }} session
 * @returns {SessionChipStatus}
 */
export function resolveSessionChipStatus(session) {
  if (
    session.approval_status === "approved" ||
    session.soap_status === "approved" ||
    session.status === "SOAP_APPROVED" ||
    session.status === "COMPLETED" ||
    session.status === "READY_FOR_PRESCRIPTION" ||
    session.status === "PRESCRIPTION_APPROVED"
  ) {
    return "approved";
  }

  if (
    session.approval_status === "rejected" ||
    session.soap_status === "rejected" ||
    session.status === "FAILED"
  ) {
    return "rejected";
  }

  if (
    session.approval_status === "pending_approval" ||
    ["SOAP_REVIEWING", "SOAP_REVIEW_REQUIRED", "SOAP_READY"].includes(session.status ?? "") ||
    session.soap_status === "reviewing" ||
    session.soap_status === "review_required" ||
    session.soap_status === "ready"
  ) {
    return "pending_review";
  }

  return "draft";
}
