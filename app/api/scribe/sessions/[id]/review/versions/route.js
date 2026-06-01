import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../_helpers/context";

const log = scribeLogger.child({ component: "API transcript versions" });

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;
    const { transcriptReviewService } = scribe.services;
    const versions = await transcriptReviewService.getVersions(id, ctx);
    return NextResponse.json({ versions }, { status: 200 });
  } catch (err) {
    log.error("Get transcript versions failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;
    const body = await request.json().catch(() => ({}));
    const { transcriptReviewService } = scribe.services;
    const version = await transcriptReviewService.createVersion(id, body, ctx);
    return NextResponse.json(version, { status: 201 });
  } catch (err) {
    log.error("Create transcript version failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
