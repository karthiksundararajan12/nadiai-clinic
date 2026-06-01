/**
 * POST /api/scribe/sessions/[id]/transcription/queue
 * Queues transcription for an uploaded session.
 */

import { NextResponse } from "next/server";
import {
  createScribeServices,
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { resolveRequestContext } from "../../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/transcription/queue" });

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { transcriptionService } = createScribeServices();
    const result = await transcriptionService.queueSession(id, body, ctx);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    log.error("Queue transcription failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
