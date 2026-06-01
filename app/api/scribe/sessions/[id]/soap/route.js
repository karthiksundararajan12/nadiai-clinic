import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/soap" });

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx } = scribe;

    const { soapGenerationService } = scribe.services;
    const result = await soapGenerationService.getSOAP(id, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Get SOAP note failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
