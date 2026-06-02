/**
 * GET /api/scribe/consultations/history?bucket=active|history|all&page=1&limit=50
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/consultations/history" });

export async function GET(request) {
  try {
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;

    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket") ?? "all";
    const rawFilters = Object.fromEntries(searchParams.entries());

    const { consultationHistoryService } = scribe.services;
    const result = await consultationHistoryService.listEnriched(rawFilters, ctx, bucket);

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("List consultation history failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
