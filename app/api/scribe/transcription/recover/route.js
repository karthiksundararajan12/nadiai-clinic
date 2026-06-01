/**
 * POST /api/scribe/transcription/recover
 *
 * Protected failure-recovery endpoint. Requeues stale processing jobs.
 */

import { NextResponse } from "next/server";
import {
  createScribeServices,
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { assertWorkerAuthorized } from "../../_helpers/worker-auth";

const log = scribeLogger.child({ component: "API /api/scribe/transcription/recover" });

export async function POST(request) {
  try {
    assertWorkerAuthorized(request);
    const body = await request.json().catch(() => ({}));
    const { transcriptionService } = createScribeServices();
    const result = await transcriptionService.recoverStaleJobs(body);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Recover transcription jobs failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
