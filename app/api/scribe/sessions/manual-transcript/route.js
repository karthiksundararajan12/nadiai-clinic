/**
 * POST /api/scribe/sessions/manual-transcript
 *
 * Creates a session and imports a manually entered transcript (no Whisper).
 */

import { NextResponse } from "next/server";
import { isScribeError, scribeLogger, toApiError } from "@/features/scribe";
import { resolveScribeContext } from "../../_helpers/context";
import { CreateSessionSchema } from "@/features/scribe/schemas.js";

const log = scribeLogger.child({
  component: "API /api/scribe/sessions/manual-transcript",
});

export async function POST(request) {
  try {
    const scribe = await resolveScribeContext(request);
    if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { ctx, services } = scribe;

    const body = await request.json().catch(() => ({}));
    const sessionInput = CreateSessionSchema.safeParse({
      language: body.language,
      patient_id: body.patient_id,
      appointment_id: body.appointment_id,
    });
    if (!sessionInput.success) {
      return NextResponse.json(
        { error: "Invalid session input", details: sessionInput.error.flatten() },
        { status: 400 },
      );
    }

    const session = await services.sessionService.createSession(sessionInput.data, ctx);
    const result = await services.transcriptionService.importManualTranscript(
      session.id,
      body,
      ctx,
    );

    log.info("Manual transcript imported", {
      sessionId: session.id,
      doctorId: ctx.doctorId,
    });

    return NextResponse.json(
      { session: result.session, transcription: result.transcription },
      { status: 201 },
    );
  } catch (err) {
    log.error("Manual transcript import failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    const apiError = toApiError(err);
    const status = isScribeError(err) ? err.statusCode : 500;
    return NextResponse.json(apiError, { status });
  }
}
