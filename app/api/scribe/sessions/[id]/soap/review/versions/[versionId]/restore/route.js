/**
 * POST /api/scribe/sessions/[id]/soap/review/versions/[versionId]/restore
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "@/app/api/scribe/_helpers/context";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/soap/review/versions/[versionId]/restore",
});

export async function POST(request, { params }) {
  try {
    const { id, versionId } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const result = await services.soapReviewService.restoreVersion(
      id,
      { version_id: versionId },
      ctx,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("SOAP version restore failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
