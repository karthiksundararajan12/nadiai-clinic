/**
 * POST /api/scribe/sessions/release-blocking
 * Fails any in-flight sessions blocking a new recording.
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/release-blocking" });

export async function POST(request) {
  try {
    const scribe = await resolveScribeContext(request);
    if (!scribe) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { ctx, sessionService } = scribe;

    const result = await sessionService.releaseBlockingSessions(ctx);
    log.info("Released blocking sessions", { released: result.released, doctorId: ctx.doctorId });
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Release blocking sessions failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
