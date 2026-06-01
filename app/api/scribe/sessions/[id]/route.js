/**
 * GET    /api/scribe/sessions/[id]          — fetch a single session
 * PATCH  /api/scribe/sessions/[id]          — update data or transition state
 * DELETE /api/scribe/sessions/[id]          — soft-delete a session
 *
 * PATCH body is a discriminated union on the `action` field:
 *
 *   { action: "update",     ...UpdateSessionInput }
 *   { action: "transition", to_status: SESSION_STATUS, reason?, metadata? }
 *   { action: "finalize",   total_chunks, audio_duration_seconds, audio_size_bytes }
 *
 * Additionally:
 *   GET  /api/scribe/sessions/[id]?include=audit  — includes the full audit trail
 */

import { NextResponse }                         from "next/server";
import {
  createScribeServices,
  PatchSessionSchema,
  toApiError,
  isScribeError,
  scribeLogger,
}                                               from "@/features/scribe";
import { resolveRequestContext }                from "../../_helpers/context";

const log = scribeLogger.child({ component: "API /api/scribe/sessions/[id]" });

// ─────────────────────────────────────────────────────────────
// GET /api/scribe/sessions/[id]
// ─────────────────────────────────────────────────────────────

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionService, auditService } = createScribeServices();
    const session = await sessionService.getSession(id, ctx);

    // Optionally include the audit trail (?include=audit)
    const { searchParams } = new URL(request.url);
    const include = searchParams.get("include");
    if (include === "audit") {
      const trail = await auditService.getSessionAuditTrail(id, ctx.clinicId);
      return NextResponse.json({ session, auditTrail: trail }, { status: 200 });
    }

    return NextResponse.json(session, { status: 200 });
  } catch (err) {
    log.error("GET session failed", { error: err instanceof Error ? err.message : String(err) });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/scribe/sessions/[id]
// ─────────────────────────────────────────────────────────────

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json().catch(() => ({}));

    // Validate the discriminated union
    const parsed = PatchSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", code: "VALIDATION_ERROR", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const input = parsed.data;
    const { sessionService } = createScribeServices();
    let session;

    switch (input.action) {
      case "update": {
        const { action: _a, ...updateFields } = input;
        session = await sessionService.updateSession(id, updateFields, ctx);
        break;
      }

      case "transition": {
        const { action: _a, ...transitionFields } = input;
        session = await sessionService.transitionState(id, transitionFields, ctx);
        break;
      }

      case "finalize": {
        const { action: _a, ...finalizeFields } = input;
        session = await sessionService.finalizeUpload(id, finalizeFields, ctx);
        break;
      }

      default:
        return NextResponse.json(
          { error: "Unknown action", code: "UNKNOWN_ACTION" },
          { status: 400 },
        );
    }

    log.info("Session patched", {
      sessionId: id,
      action:    input.action,
      doctorId:  ctx.doctorId,
    });

    return NextResponse.json(session, { status: 200 });
  } catch (err) {
    log.error("PATCH session failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/scribe/sessions/[id]
// ─────────────────────────────────────────────────────────────

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    const ctx = await resolveRequestContext(request);
    if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sessionService } = createScribeServices();
    await sessionService.deleteSession(id, ctx);

    log.info("Session deleted", { sessionId: id, doctorId: ctx.doctorId });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    log.error("DELETE session failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
