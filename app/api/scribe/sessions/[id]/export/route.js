/**
 * GET /api/scribe/sessions/[id]/export?format=json|html
 * Exports SOAP note + transcript. Logs SESSION_EXPORTED audit event.
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/export" });

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") === "html" ? "html" : "json";

    const result = await services.soapExportService.exportSession(id, ctx, { format });

    if (format === "html") {
      return new NextResponse(result.html, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Content-Disposition": `inline; filename="${result.filename}"`,
        },
      });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Export session failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
