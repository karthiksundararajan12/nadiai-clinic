/**
 * POST /api/scribe/sessions/[id]/transcription/live-complete
 *
 * Persists a live-streamed Deepgram transcript after audio upload.
 * Does not call the pre-recorded API.
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe/client";
import { resolveScribeContext } from "../../../../_helpers/context";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/transcription/live-complete",
});

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;
    const body = await request.json().catch(() => ({}));

    const result = await services.transcriptionService.completeFromLiveResult(id, body, ctx);

    log.info("Live transcription persisted", {
      sessionId: id,
      status: result.session?.status,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Live transcription persist failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
