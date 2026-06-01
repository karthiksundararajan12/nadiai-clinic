import { NextResponse } from "next/server";
import { createScribeServices, isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveRequestContext } from "../../../../../_helpers/context";

const log = scribeLogger.child({ component: "API SOAP review versions" });

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { soapReviewService } = createScribeServices();
    const versions = await soapReviewService.getVersions(id, ctx);
    return NextResponse.json({ versions }, { status: 200 });
  } catch (err) {
    log.error("Get SOAP versions failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json().catch(() => ({}));
    const { soapReviewService } = createScribeServices();
    const version = await soapReviewService.createVersion(id, body, ctx);
    return NextResponse.json(version, { status: 201 });
  } catch (err) {
    log.error("Create SOAP version failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
