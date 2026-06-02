/**
 * GET  /api/scribe/sessions/:id/prescription/review
 *   Opens the review workspace.
 *   Advances PRESCRIPTION_DRAFT_READY → PRESCRIPTION_REVIEW_REQUIRED → PRESCRIPTION_REVIEWING.
 *   Returns: { session, draft, review, versions, events }
 *
 * PATCH /api/scribe/sessions/:id/prescription/review
 *   Saves inline edits (autosave or manual field update).
 *   Body: { draft: PrescriptionDraft, source: "autosave" | "manual_edit" }
 *   Returns: updated draft
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../_helpers/context";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/prescription/review",
});

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(_request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const workspace = await services.prescriptionReviewService.getWorkspace(id, ctx);
    return NextResponse.json(workspace, { status: 200 });
  } catch (err) {
    log.error("Get prescription review workspace failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status   = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const body = await request.json().catch(() => ({}));
    const draft = await services.prescriptionReviewService.updateDraft(id, body, ctx);
    return NextResponse.json({ draft }, { status: 200 });
  } catch (err) {
    log.error("Update prescription draft failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status   = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
