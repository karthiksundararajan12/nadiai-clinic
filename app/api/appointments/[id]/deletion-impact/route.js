/**
 * GET /api/appointments/[id]/deletion-impact
 *
 * Counts of booking_invoices / scribe_sessions that hard-delete will remove.
 */

import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  InvoiceRepository,
  InvoiceStorageService,
  bookingLogger,
} from "@/features/booking";
import { AppointmentRequestError } from "@/features/appointments/appointments.service";
import { AppointmentDeleteService } from "@/features/appointments/appointment-delete.service";
import { SessionRepository } from "@/features/scribe/repository/session.repository";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({
  component: "API /api/appointments/[id]/deletion-impact",
});

export async function GET(request, { params }) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: appointmentId } = await params;
    if (!appointmentId) {
      return NextResponse.json({ error: "Missing appointment id" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const service = new AppointmentDeleteService({
      appointmentRepository: new AppointmentRepository(supabase),
      invoiceRepository: new InvoiceRepository(supabase),
      invoiceStorageService: new InvoiceStorageService(supabase),
      scribeSessionRepository: new SessionRepository(supabase),
    });

    const impact = await service.getDeletionImpact(ctx.clinicId, appointmentId);
    return NextResponse.json({ impact }, { status: 200 });
  } catch (error) {
    if (error instanceof AppointmentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    log.error("Failed to load appointment deletion impact", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load deletion impact" },
      { status: 500 },
    );
  }
}
