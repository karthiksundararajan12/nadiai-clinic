import { NextResponse } from "next/server";
import { resolveScribeContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  AppointmentRepository,
  DoctorProfileRepository,
  PatientRepository,
} from "@/features/booking/server-core";
import { PatientsService } from "@/features/patients/patients.service";
import { VaccinationRepository } from "@/features/vaccinations/vaccination.repository";
import { VaccinationSeedingService } from "@/features/vaccinations/vaccination-seeding.service";
import { createLogger } from "@/features/scribe/logger.js";
import { normalizePhoneForWhatsApp } from "@/features/booking/lib/phone.js";
import {
  acceptExistingPatient,
  confirmDetectedPatient,
  createPayload,
  existingPatientPrompt,
} from "@/features/scribe/consultation-workspace/lib/confirm-detected-patient.js";
import { normalizeExtractedPhone } from "@/features/scribe/consultation-workspace/lib/patient-extraction.js";

const log = createLogger({ component: "API /api/scribe/confirm-patient" });

function patientsService() {
  const supabase = getSupabaseAdminClient();
  const vaccinationSeedingService = new VaccinationSeedingService(
    new VaccinationRepository(supabase),
    new DoctorProfileRepository(supabase),
  );
  return {
    supabase,
    service: new PatientsService(
      new PatientRepository(supabase),
      new AppointmentRepository(supabase),
      { vaccinationSeedingService },
    ),
  };
}

async function lastVisitLabel(supabase, clinicId, patientId) {
  const { data, error } = await supabase
    .from("appointments")
    .select("slot_start")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .order("slot_start", { ascending: false })
    .limit(1);
  if (error || !data?.[0]?.slot_start) return "no previous visit";
  const when = new Date(data[0].slot_start);
  if (Number.isNaN(when.getTime())) return "no previous visit";
  return when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function publicPatient(patient, lastVisit) {
  return {
    id: patient.id,
    full_name: patient.full_name ?? patient.name ?? "",
    name: patient.full_name ?? patient.name ?? "",
    age_years: patient.age_years ?? patient.age ?? null,
    gender: patient.gender ?? null,
    lastVisitLabel: lastVisit,
  };
}

export async function POST(request) {
  const scribe = await resolveScribeContext(request);
  if (!scribe) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { ctx, services } = scribe;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected patient details" }, { status: 400 });
  }

  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : null;
  const attach = sessionId
    ? async (patientId) => {
        await services.sessionService.updateSession(sessionId, { patient_id: patientId }, ctx);
      }
    : undefined;

  try {
    if (body?.action === "use-existing") {
      const patientId = body?.patientId;
      if (!patientId) return NextResponse.json({ error: "Patient is required" }, { status: 400 });
      const { supabase, service } = patientsService();
      const detail = await service.getDetail(ctx.clinicId, patientId);
      const patient = publicPatient(detail?.patient ?? { id: patientId }, await lastVisitLabel(supabase, ctx.clinicId, patientId));
      const result = await acceptExistingPatient(patient, { attach });
      return NextResponse.json({ ...result, prompt: null });
    }

    const fields = {
      name: body?.name ?? null,
      age: body?.age ?? null,
      age_unit: body?.age_unit ?? null,
      sex: body?.sex ?? null,
      phone: normalizeExtractedPhone(body?.phone),
    };
    const { supabase, service } = patientsService();
    const result = await confirmDetectedPatient(fields, {
      async findByPhone(phone) {
        const stored = normalizePhoneForWhatsApp(phone);
        const contact = stored?.length === 10 ? `91${stored}` : stored;
        const rows = contact
          ? await new PatientRepository(supabase).findByContact(ctx.clinicId, contact)
          : [];
        return Promise.all(rows.map(async (row) => publicPatient(row, await lastVisitLabel(supabase, ctx.clinicId, row.id))));
      },
      async findByNameAge(next) {
        const { data } = await supabase
          .from("patients")
          .select("id, full_name, age_years, gender")
          .eq("clinic_id", ctx.clinicId)
          .is("deleted_at", null)
          .ilike("full_name", String(next.name ?? "").trim())
          .limit(20);
        return Promise.all((data ?? []).map(async (row) => publicPatient(row, await lastVisitLabel(supabase, ctx.clinicId, row.id))));
      },
      async createPatient(next) {
        const created = await service.create(
          ctx.clinicId,
          createPayload(next, { allowFamilyMember: body?.action === "create-new" }),
        );
        return created.patient;
      },
      attach,
    }, { forceCreate: body?.action === "create-new" });

    if (result.action === "confirm-existing") {
      return NextResponse.json({ ...result, prompt: existingPatientPrompt(result.patient) });
    }
    return NextResponse.json({ ...result, prompt: null });
  } catch (error) {
    log.error("Confirm patient failed", {
      clinicId: ctx.clinicId,
      error: error instanceof Error ? error.message : "confirm failed",
    });
    const status = error?.statusCode ?? 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not confirm the patient" },
      { status },
    );
  }
}
