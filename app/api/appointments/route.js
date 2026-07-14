import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  DoctorProfileRepository,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import {
  AppointmentRequestError,
  AppointmentsService,
} from "@/features/appointments/appointments.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({ component: "API /api/appointments" });

async function resolveAppointmentsService(request) {
  const ctx = await resolveRequestContext(request);
  if (!ctx) return null;

  const supabase = getSupabaseAdminClient();
  return {
    ctx,
    service: new AppointmentsService(
      new AppointmentRepository(supabase),
      new PatientRepository(supabase),
      new DoctorProfileRepository(supabase),
    ),
  };
}

function errorResponse(error) {
  if (error instanceof AppointmentRequestError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode },
    );
  }
  log.error("Appointments API failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { error: "Failed to process appointment request" },
    { status: 500 },
  );
}

export async function GET(request) {
  try {
    const resolved = await resolveAppointmentsService(request);
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const params = new URL(request.url).searchParams;
    const appointmentId = params.get("appointmentId");
    if (appointmentId) {
      const appointment = await resolved.service.getById(
        resolved.ctx.clinicId,
        appointmentId,
      );
      return NextResponse.json({ appointment }, { status: 200 });
    }

    const scope = params.get("scope") ?? "all";
    const [appointments, patients] = await Promise.all([
      resolved.service.list(resolved.ctx.clinicId, scope),
      resolved.service.listPatientOptions(resolved.ctx.clinicId),
    ]);
    return NextResponse.json({ appointments, patients }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const resolved = await resolveAppointmentsService(request);
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const appointment = await resolved.service.create(
      resolved.ctx.clinicId,
      body,
    );
    return NextResponse.json({ appointment }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    const resolved = await resolveAppointmentsService(request);
    if (!resolved) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    if (!body.appointmentId) {
      throw new AppointmentRequestError("appointmentId is required");
    }

    const appointment =
      body.action === "cancel"
        ? await resolved.service.cancel(
            resolved.ctx.clinicId,
            body.appointmentId,
          )
        : body.action === "reschedule"
          ? await resolved.service.reschedule(
              resolved.ctx.clinicId,
              body.appointmentId,
              body,
            )
          : (() => {
              throw new AppointmentRequestError("Invalid appointment action");
            })();

    return NextResponse.json({ appointment }, { status: 200 });
  } catch (error) {
    return errorResponse(error);
  }
}

