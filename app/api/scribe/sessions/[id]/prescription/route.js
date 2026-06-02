/**
 * GET /api/scribe/sessions/:id/prescription
 *
 * Returns the current prescription draft and all versions for a session.
 *
 * Response: { session, draft, versions }
 *   draft is null when generation has not been started yet.
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../_helpers/context";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/prescription",
});

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;

    const { prescriptionService } = scribe.services;
    const result = await prescriptionService.getPrescription(id, ctx);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Get prescription draft failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status   = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
