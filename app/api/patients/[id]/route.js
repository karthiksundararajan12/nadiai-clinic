import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  InvoiceRepository,
  InvoiceStorageService,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import {
  PatientRequestError,
  PatientsService,
} from "@/features/patients/patients.service";
import { PatientDeleteService } from "@/features/patients/patient-delete.service";
import {
  VaccinationRequestError,
  VaccinationsService,
} from "@/features/vaccinations/vaccinations.service";
import { VaccinationRepository } from "@/features/vaccinations/vaccination.repository";
import { VitalsRepository } from "@/features/vitals/vitals.repository";
import { VitalsRequestError, VitalsService } from "@/features/vitals/vitals.service";
import { SessionRepository } from "@/features/scribe/repository/session.repository";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/patients/[id]" });

function createPatientDeleteService(supabase) {
  return new PatientDeleteService({
    patientRepository: new PatientRepository(supabase),
    appointmentRepository: new AppointmentRepository(supabase),
    invoiceRepository: new InvoiceRepository(supabase),
    invoiceStorageService: new InvoiceStorageService(supabase),
    scribeSessionRepository: new SessionRepository(supabase),
    vaccinationRepository: new VaccinationRepository(supabase),
    vitalsRepository: new VitalsRepository(supabase),
  });
}

function errorResponse(error, fallbackMessage = "Failed to load patient") {
  if (
    error instanceof PatientRequestError ||
    error instanceof VaccinationRequestError ||
    error instanceof VitalsRequestError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.statusCode });
  }
  log.error("Patient API failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

/**
 * GET /api/patients/[id] — single clinic-scoped patient, their full
 * appointment history, vaccination schedule (if any), and vitals history
 * for the /patients/[id] detail page.
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
    const appointmentRepository = new AppointmentRepository(supabase);
    const patientsService = new PatientsService(
      patientRepository,
      appointmentRepository,
    );
    const vaccinationsService = new VaccinationsService(
      new VaccinationRepository(supabase),
      patientRepository,
    );
    const vitalsService = new VitalsService(
      new VitalsRepository(supabase),
      patientRepository,
      appointmentRepository,
    );

    const detail = await patientsService.getDetail(ctx.clinicId, id);
    // Vaccination schedule + vitals are best-effort here — a patient with
    // none (or a lookup hiccup) should never hide the rest of the detail page.
    const [vaccinations, vitals] = await Promise.all([
      vaccinationsService.listForPatient(ctx.clinicId, id).catch(() => []),
      vitalsService.listForPatient(ctx.clinicId, id).catch(() => []),
    ]);

    return NextResponse.json({ ...detail, vaccinations, vitals }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/patients/[id] — hard-delete patient + cascade (invoices →
 * scribe_sessions → appointments → patient). Vaccination/vitals rows cascade
 * via DB FK. Refuses when paid-unrefunded appointments remain.
 */
export async function DELETE(request, { params }) {
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
    const result = await createPatientDeleteService(supabase).hardDelete(
      ctx.clinicId,
      id,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return errorResponse(error, "Failed to delete patient");
  }
}
