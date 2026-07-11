import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import { createScribeServices } from "@/features/scribe";
import { DashboardService } from "@/features/dashboard/dashboard.service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";

const log = bookingLogger.child({ component: "API /api/dashboard" });

export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Authentication is resolved with the user's server client above. The
    // repositories use the admin client only after that check and remain
    // explicitly scoped by ctx.clinicId / ctx.doctorId.
    const supabase = getSupabaseAdminClient();
    const patientRepository = new PatientRepository(supabase);
    const appointmentRepository = new AppointmentRepository(supabase);
    const { sessionService } = createScribeServices(supabase);
    const dashboardService = new DashboardService(
      patientRepository,
      appointmentRepository,
      sessionService,
    );

    const dashboard = await dashboardService.getDashboardData(ctx);
    return NextResponse.json(dashboard, { status: 200 });
  } catch (error) {
    log.error("Failed to load dashboard data", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 },
    );
  }
}

