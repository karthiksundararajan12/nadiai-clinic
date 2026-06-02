/**
 * POST /api/scribe/sessions/:id/prescription/review/approve
 *
 * Approves the prescription draft.
 * Creates a version snapshot and transitions session → PRESCRIPTION_APPROVED.
 * Body (optional): { create_version?: boolean }
 * Returns: { session, draft, review, version }
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../../_helpers/context";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/prescription/review/approve",
});

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const body   = await request.json().catch(() => ({}));
    const result = await services.prescriptionReviewService.approve(id, body, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Approve prescription failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status   = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
