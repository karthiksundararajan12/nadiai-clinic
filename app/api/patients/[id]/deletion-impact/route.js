/**
 * GET /api/patients/[id]/deletion-impact
 *
 * Returns counts of rows that a hard-delete will wipe (for the two-step
 * confirm dialog). Clinic-scoped via resolveRequestContext.
 */

import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  InvoiceRepository,
  InvoiceStorageService,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import { PatientRequestError } from "@/features/patients/patients.service";
import { PatientDeleteService } from "@/features/patients/patient-delete.service";
import { VaccinationRepository } from "@/features/vaccinations/vaccination.repository";
import { VitalsRepository } from "@/features/vitals/vitals.repository";
import { SessionRepository } from "@/features/scribe/repository/session.repository";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({
  component: "API /api/patients/[id]/deletion-impact",
});

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
    const service = new PatientDeleteService({
      patientRepository: new PatientRepository(supabase),
      appointmentRepository: new AppointmentRepository(supabase),
      invoiceRepository: new InvoiceRepository(supabase),
      invoiceStorageService: new InvoiceStorageService(supabase),
      scribeSessionRepository: new SessionRepository(supabase),
      vaccinationRepository: new VaccinationRepository(supabase),
      vitalsRepository: new VitalsRepository(supabase),
    });

    const impact = await service.getDeletionImpact(ctx.clinicId, id);
    return NextResponse.json({ impact }, { status: 200 });
  } catch (error) {
    if (error instanceof PatientRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    log.error("Failed to load patient deletion impact", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load deletion impact" },
      { status: 500 },
    );
  }
}
