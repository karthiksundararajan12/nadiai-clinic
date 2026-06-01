/**
 * GET /api/scribe/sessions/[id]/transcription
 * Returns transcription summary and normalized segments for a session.
 */

import { NextResponse } from "next/server";
import {
  createScribeServices,
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { resolveRequestContext } from "../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/transcription" });

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { transcriptionService } = createScribeServices();
    const result = await transcriptionService.getTranscription(id, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Get transcription failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
