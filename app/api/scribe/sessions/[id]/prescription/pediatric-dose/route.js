/**
 * GET  /api/scribe/sessions/:id/prescription/pediatric-dose
 *   Returns active pediatric dosage reference rows (extendable catalog).
 *
 * POST /api/scribe/sessions/:id/prescription/pediatric-dose
 *   Logs suggested / accepted / dismissed / exceeds_max dose events for audit.
 *   Body: LogPediatricDoseSchema
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../../_helpers/context";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/[id]/prescription/pediatric-dose",
});

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(_request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const references = await services.pediatricDosageService.listReferences(id, ctx);
    return NextResponse.json({ references }, { status: 200 });
  } catch (err) {
    log.error("List pediatric dosage references failed", {
      error: err instanceof Error ? err.message : String(err),
    });
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
    const { ctx, services } = scribe;

    const body = await request.json().catch(() => ({}));
    const result = await services.pediatricDosageService.logDoseEvent(id, body, ctx);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    log.error("Log pediatric dose event failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
