import { NextResponse } from "next/server";
import { PatientRepository, bookingLogger } from "@/features/booking";
import { VaccinationRepository } from "@/features/vaccinations/vaccination.repository";
import {
  VaccinationRequestError,
  VaccinationsService,
} from "@/features/vaccinations/vaccinations.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/vaccinations" });

/**
 * GET /api/vaccinations?search=&status=&range=&from=&to=&limit=&offset=
 *   → { vaccinations, total, limit, offset, hasMore } (same pagination
 *     shape as GET /api/payments)
 *
 * POST /api/vaccinations { patientId, vaccineName, dueDate } → { vaccination }
 */

function resolveVaccinationsService() {
  const supabase = getSupabaseAdminClient();
  return new VaccinationsService(
    new VaccinationRepository(supabase),
    new PatientRepository(supabase),
  );
}

function errorResponse(error) {
  if (error instanceof VaccinationRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  // Previously only logged error.message, which for a DatabaseError is just
  // the generic "Database operation failed: <operation>" wrapper — the
  // actual Postgrest failure (e.g. a missing-column 42703) lives on
  // `.cause` (see DatabaseError in features/booking/errors.js) and was
  // being silently dropped, making this endpoint impossible to debug from
  // logs alone. Log everything: message, error code, the underlying DB
  // cause, and the stack.
  log.error("Vaccinations API failed", {
    error: error instanceof Error ? error.message : String(error),
    code: error?.code,
    cause: error?.cause ?? null,
    stack: error instanceof Error ? error.stack : undefined,
  });
  // Also console.error the raw error object (not just a rewrapped
  // message) so it's visible even where structured log fields get
  // truncated/dropped by the aggregator.
  console.error("Vaccinations API failed:", error);
  return NextResponse.json(
    { error: "Failed to process vaccination request" },
    { status: 500 },
  );
}

export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status") ?? "all";
    const range = searchParams.get("range") ?? "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limitParam = Number(searchParams.get("limit"));
    const offsetParam = Number(searchParams.get("offset"));
    const limit = Number.isFinite(limitParam) ? limitParam : 20;
    const offset = Number.isFinite(offsetParam) ? offsetParam : 0;

    const service = resolveVaccinationsService();
    const result = await service.list(ctx.clinicId, {
      search,
      status,
      range,
      from,
      to,
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const service = resolveVaccinationsService();
    const result = await service.create(ctx.clinicId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
