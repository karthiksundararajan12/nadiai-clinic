/**
 * POST /api/scribe/sessions/:id/prescription/generate
 *
 * Generates a prescription draft from an approved SOAP note.
 * Session must be in SOAP_APPROVED status.
 *
 * Body (optional):
 *   { force?: boolean }   — force=true re-generates even if a draft exists
 *
 * Returns: { draft, version, reused }
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../_helpers/context";

export const maxDuration = 120;

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/prescription/generate",
});

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;

    const body = await request.json().catch(() => ({}));
    const { prescriptionService } = scribe.services;
    const result = await prescriptionService.generate(id, body, ctx);

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    log.error("Generate prescription draft failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status   = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
