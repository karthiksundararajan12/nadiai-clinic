/**
 * DELETE /api/appointments/[id]
 *
 * Hard-deletes an appointment (any status) after cascading booking_invoices
 * and scribe_sessions. Refuses when payment_status is a captured payment
 * that has not been refunded — Cancel first. No Razorpay refund on delete.
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
  component: "API /api/appointments/[id]",
});

function createDeleteService(supabase) {
  return new AppointmentDeleteService({
    appointmentRepository: new AppointmentRepository(supabase),
    invoiceRepository: new InvoiceRepository(supabase),
    invoiceStorageService: new InvoiceStorageService(supabase),
    scribeSessionRepository: new SessionRepository(supabase),
  });
}

export async function DELETE(request, { params }) {
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
    const result = await createDeleteService(supabase).hardDelete(
      ctx.clinicId,
      appointmentId,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof AppointmentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    log.error("Failed to delete appointment", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to delete appointment" },
      { status: 500 },
    );
  }
}
