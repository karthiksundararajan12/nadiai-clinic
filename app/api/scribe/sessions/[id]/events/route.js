/**
 * POST /api/scribe/sessions/[id]/events
 * Client lifecycle events (recording stopped, etc.) for audit trail.
 */

import { NextResponse } from "next/server";
import { AUDIT_ACTION, isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]/events" });

const ALLOWED_EVENTS = {
  recording_stopped: AUDIT_ACTION.RECORDING_STOPPED,
  recording_started: AUDIT_ACTION.RECORDING_STARTED,
};

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const body = await request.json().catch(() => ({}));
    const action = ALLOWED_EVENTS[body?.action];
    if (!action) {
      return NextResponse.json({ error: "Invalid event action" }, { status: 400 });
    }

    await services.sessionService.getSession(id, ctx);

    await services.auditService.log({
      action,
      sessionId: id,
      ctx,
      metadata: {
        duration_seconds: body.duration_seconds ?? null,
        source: "scribe_ui",
      },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    log.error("Session event failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
