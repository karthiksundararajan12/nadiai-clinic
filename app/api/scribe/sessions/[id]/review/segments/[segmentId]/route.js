import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../../_helpers/context";

const log = scribeLogger.child({ component: "API transcript segment review update" });

export async function PATCH(request, { params }) {
  try {
    const { id, segmentId } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;
    const body = await request.json().catch(() => ({}));
    const { transcriptReviewService } = scribe.services;
    const result = await transcriptReviewService.updateSegment(id, segmentId, body, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Update review segment failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
