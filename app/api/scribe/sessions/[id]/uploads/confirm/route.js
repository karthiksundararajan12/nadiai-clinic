/**
 * POST /api/scribe/sessions/[id]/uploads/confirm
 *
 * Confirms one audio chunk after the browser uploads it with
 * uploadToSignedUrl(). The server validates tenant ownership, expected
 * manifest values, and object existence in the private bucket.
 */

import { NextResponse } from "next/server";
import {
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { resolveScribeContext } from "../../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/uploads/confirm" });

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) {
      const { ctx } = scribe;
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { audioUploadService } = scribe.services;
    const result = await audioUploadService.confirmChunk(id, body, ctx);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Confirm audio chunk failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
