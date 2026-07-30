import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import {
  PatientRequestError,
  PatientsService,
} from "@/features/patients/patients.service";
import {
  VaccinationRequestError,
  VaccinationsService,
} from "@/features/vaccinations/vaccinations.service";
import { VaccinationRepository } from "@/features/vaccinations/vaccination.repository";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/patients/[id]" });

function errorResponse(error) {
  if (error instanceof PatientRequestError || error instanceof VaccinationRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  log.error("Patient detail API failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Failed to load patient" },
    { status: 500 },
  );
}

/**
 * GET /api/patients/[id] — single clinic-scoped patient, their full
 * appointment history, and vaccination schedule (if any) for the
 * /patients/[id] detail page.
 */
export async function GET(request, { params }) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing patient id" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const patientRepository = new PatientRepository(supabase);
    const patientsService = new PatientsService(
      patientRepository,
      new AppointmentRepository(supabase),
    );
    const vaccinationsService = new VaccinationsService(
      new VaccinationRepository(supabase),
      patientRepository,
    );

    const detail = await patientsService.getDetail(ctx.clinicId, id);
    // Vaccination schedule is best-effort here — a patient with no schedule
    // (or a lookup hiccup) should never hide the rest of the detail page.
    const vaccinations = await vaccinationsService
      .listForPatient(ctx.clinicId, id)
      .catch(() => []);

    return NextResponse.json({ ...detail, vaccinations }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
