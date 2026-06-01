import { NextResponse } from "next/server";
import { createScribeServices, isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveRequestContext } from "../../../../_helpers/context";

export const maxDuration = 120;

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/soap/generate" });

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { soapGenerationService } = createScribeServices();
    const result = await soapGenerationService.generate(id, body, ctx);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    log.error("Generate SOAP note failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
