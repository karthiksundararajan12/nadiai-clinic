/**
 * DELETE /api/payments/[appointmentId]
 *
 * P1: clear appointments.payment_* / refund_* fields, delete booking_invoices
 * row + Storage PDF, keep the appointment. Id is the appointment id (ledger
 * rows are appointments with payment_status ≠ not_required).
 */

import { NextResponse } from "next/server";
import {
  AppointmentRepository,
  InvoiceRepository,
  InvoiceStorageService,
  PaymentDeleteService,
  PaymentRequestError,
  bookingLogger,
} from "@/features/booking";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({
  component: "API /api/payments/[appointmentId]",
});

export async function DELETE(request, { params }) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { appointmentId } = await params;
    if (!appointmentId) {
      return NextResponse.json({ error: "Missing appointment id" }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const service = new PaymentDeleteService({
      appointmentRepository: new AppointmentRepository(supabase),
      invoiceRepository: new InvoiceRepository(supabase),
      invoiceStorageService: new InvoiceStorageService(supabase),
    });

    const result = await service.deletePaymentRecord(ctx.clinicId, appointmentId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PaymentRequestError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    log.error("Failed to delete payment record", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to delete payment" },
      { status: 500 },
    );
  }
}
