import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  DoctorProfileRepository,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import {
  PatientRequestError,
  PatientsService,
} from "@/features/patients/patients.service";
import { VaccinationRepository } from "@/features/vaccinations/vaccination.repository";
import { VaccinationSeedingService } from "@/features/vaccinations/vaccination-seeding.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/patients" });

function errorResponse(error) {
  if (error instanceof PatientRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }

  log.error("Patients API failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Failed to process patient request" },
    { status: 500 },
  );
}

async function resolvePatientsService() {
  const supabase = getSupabaseAdminClient();
  const vaccinationSeedingService = new VaccinationSeedingService(
    new VaccinationRepository(supabase),
    new DoctorProfileRepository(supabase),
  );
  return new PatientsService(
    new PatientRepository(supabase),
    new AppointmentRepository(supabase),
    { vaccinationSeedingService },
  );
}

/**
 * GET /api/patients — clinic patients.
 *
 * Two response shapes, kept side by side for backward compatibility with
 * existing callers (Scribe's PatientSelector, the dashboard's Add Patient
 * autocomplete):
 *
 *   - No params, or `?q=` only → legacy `{ patients, stats }` (unpaginated,
 *     in-memory search over the whole clinic — see PatientsService.list /
 *     .search).
 *   - Any of `search` / `range` / `from` / `to` / `limit` / `offset` →
 *     paginated dashboard-table shape `{ patients, total, limit, offset,
 *     hasMore }` (same pattern as GET /api/payments and
 *     GET /api/appointments) — see PatientsService.listPaginated.
 */
export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = await resolvePatientsService();
    const params = new URL(request.url).searchParams;

    const hasListParams =
      params.has("search") ||
      params.has("range") ||
      params.has("from") ||
      params.has("to") ||
      params.has("limit") ||
      params.has("offset");

    if (hasListParams) {
      const limitParam = Number(params.get("limit"));
      const offsetParam = Number(params.get("offset"));
      const result = await service.listPaginated(ctx.clinicId, {
        search: params.get("search"),
        range: params.get("range") ?? "all",
        from: params.get("from"),
        to: params.get("to"),
        limit: Number.isFinite(limitParam) ? limitParam : 20,
        offset: Number.isFinite(offsetParam) ? offsetParam : 0,
      });
      return NextResponse.json(result, { status: 200 });
    }

    const query = params.get("q");
    const result = query
      ? await service.search(ctx.clinicId, query)
      : await service.list(ctx.clinicId);
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
    const service = await resolvePatientsService();
    const result = await service.create(ctx.clinicId, body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
