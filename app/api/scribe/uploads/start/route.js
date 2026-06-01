/**
 * POST /api/scribe/uploads/start
 *
 * Called after the local browser recording is stopped.
 * Creates the scribe session, moves it to UPLOADING, stores the expected
 * chunk manifest, and returns signed upload URLs for the private bucket.
 */

import { NextResponse } from "next/server";
import {
  createScribeServices,
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { resolveRequestContext } from "../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/uploads/start" });

export async function POST(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { audioUploadService } = createScribeServices();
    const result = await audioUploadService.startUpload(body, ctx);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    log.error("Start audio upload failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
