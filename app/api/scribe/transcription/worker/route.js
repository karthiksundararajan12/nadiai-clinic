/**
 * POST /api/scribe/transcription/worker
 *
 * Protected worker endpoint. Claims and processes queued transcription jobs.
 * Intended for Vercel Cron, Supabase Cron, or an external worker.
 */

import { NextResponse } from "next/server";
import {
  createScribeServices,
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { assertWorkerAuthorized } from "../../_helpers/worker-auth";

export const maxDuration = 300;

const log = scribeLogger.child({ component: "API /api/scribe/transcription/worker" });

export async function POST(request) {
  try {
    assertWorkerAuthorized(request);
    const body = await request.json().catch(() => ({}));
    const { transcriptionService } = createScribeServices();
    const result = await transcriptionService.processQueue(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Transcription worker failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
