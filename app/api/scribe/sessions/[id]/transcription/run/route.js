/**
 * POST /api/scribe/sessions/[id]/transcription/run
 *
 * Queues (if needed) and runs Deepgram transcription for this session.
 * Doctor-authenticated — intended for the Scribe UI without a separate worker cron.
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../_helpers/context";

export const maxDuration = 300;

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/transcription/run",
});

export async function POST(_request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(_request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const result = await services.transcriptionService.runForSession(id, ctx);

    log.info("Session transcription completed", {
      sessionId: id,
      status: result.session?.status,
      jobStatus: result.result?.status,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Run session transcription failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
