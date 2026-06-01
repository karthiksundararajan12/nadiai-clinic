/**
 * GET  /api/scribe/sessions        — paginated session list for the doctor
 * POST /api/scribe/sessions        — create a new scribe session
 */

import { NextResponse }                    from "next/server";
import { toApiError, isScribeError, scribeLogger } from "@/features/scribe";
import { resolveScribeContext }            from "../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions" });

// ─────────────────────────────────────────────────────────────
// GET /api/scribe/sessions
// ─────────────────────────────────────────────────────────────

export async function GET(request) {
  try {
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;

    const { searchParams } = new URL(request.url);
    const rawFilters = Object.fromEntries(searchParams.entries());

    // Support multi-value status param (?status=CREATED&status=RECORDING)
    const statusValues = searchParams.getAll("status");
    if (statusValues.length > 1) rawFilters.status = statusValues;

    const { sessionService } = scribe.services;
    const result = await sessionService.listSessions(rawFilters, ctx);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("GET /api/scribe/sessions failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/scribe/sessions
// ─────────────────────────────────────────────────────────────

export async function POST(request) {
  try {
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;

    const body = await request.json().catch(() => ({}));

    const { sessionService } = scribe.services;
    const session = await sessionService.createSession(body, ctx);

    log.info("Session created via API", {
      sessionId: session.id,
      doctorId:  ctx.doctorId,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (err) {
    log.error("POST /api/scribe/sessions failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
