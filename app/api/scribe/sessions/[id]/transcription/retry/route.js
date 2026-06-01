/**
 * POST /api/scribe/sessions/[id]/transcription/retry
 * Retries a failed transcription workflow.
 */

import { NextResponse } from "next/server";
import {
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { resolveScribeContext } from "../../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/transcription/retry" });

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;

    const body = await request.json().catch(() => ({}));
    const { transcriptionService } = scribe.services;
    const result = await transcriptionService.retrySession(id, body, ctx);
    return NextResponse.json(result, { status: 202 });
  } catch (err) {
    log.error("Retry transcription failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
