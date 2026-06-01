import { NextResponse } from "next/server";
import { createScribeServices, isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveRequestContext } from "../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/review" });

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { transcriptReviewService } = createScribeServices();
    const result = await transcriptReviewService.getWorkspace(id, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Get review workspace failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
