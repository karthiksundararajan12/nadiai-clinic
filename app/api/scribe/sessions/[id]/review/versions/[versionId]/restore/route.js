import { NextResponse } from "next/server";
import { createScribeServices, isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveRequestContext } from "../../../../../../_helpers/context";

const log = scribeLogger.child({ component: "API restore transcript version" });

export async function POST(request, { params }) {
  try {
    const { id, versionId } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { transcriptReviewService } = createScribeServices();
    const result = await transcriptReviewService.restoreVersion(id, { version_id: versionId }, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Restore transcript version failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
