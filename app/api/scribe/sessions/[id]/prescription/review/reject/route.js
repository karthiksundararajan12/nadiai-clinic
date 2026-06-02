/**
 * POST /api/scribe/sessions/:id/prescription/review/reject
 *
 * Rejects the prescription draft.
 *   regenerate: false  → session stays at PRESCRIPTION_REVIEW_REQUIRED (doctor edits further)
 *   regenerate: true   → session rolls back to SOAP_APPROVED (doctor triggers fresh generation)
 *
 * Body: { reason: string, regenerate?: boolean }
 * Returns: { session, draft, review }
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../../_helpers/context";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/prescription/review/reject",
});

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const body   = await request.json().catch(() => ({}));
    const result = await services.prescriptionReviewService.reject(id, body, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Reject prescription failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status   = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
