/**
 * POST /api/scribe/sessions/[id]/uploads/finalize
 *
 * Finalizes the audio upload after all chunks are confirmed.
 * Moves the session UPLOADING → UPLOADED.
 *
 * This route intentionally does not enqueue transcription or call OpenAI.
 */

import { NextResponse } from "next/server";
import {
  createScribeServices,
  isScribeError,
  scribeLogger,
  toApiError,
} from "@/features/scribe";
import { resolveRequestContext } from "../../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/uploads/finalize" });

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { audioUploadService } = createScribeServices();
    const session = await audioUploadService.finalizeUpload(id, body, ctx);

    return NextResponse.json(session, { status: 200 });
  } catch (err) {
    log.error("Finalize audio upload failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
