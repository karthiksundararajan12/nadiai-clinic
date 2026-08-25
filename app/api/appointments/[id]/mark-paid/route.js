/**
 * POST /api/appointments/[id]/mark-paid
 *
 * Doctor/staff records in-person payment for a confirmed pay-at-clinic
 * appointment (payment_status = pay_at_clinic → paid). Regenerates the
 * invoice PDF so it shows "Paid at Clinic" with paid_at.
 */

import { NextResponse } from "next/server";
import { bookingLogger } from "@/features/booking/client";
import {
  AppointmentRepository, DoctorProfileRepository, PatientRepository,
  createBookingServices, alertOps, OPS_ALERT_STEP
} from "@/features/booking/server-core";
import { attachInvoicePdf } from "@/features/booking/server-pdf";
import { AppointmentsService, AppointmentRequestError } from "@/features/appointments/appointments.service";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const log = bookingLogger.child({
  component: "API /api/appointments/[id]/mark-paid",
});

export async function POST(request, { params }) {
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
    const service = new AppointmentsService(
      new AppointmentRepository(supabase),
      new PatientRepository(supabase),
      new DoctorProfileRepository(supabase),
    );

    const appointment = await service.markPayAtClinicAsPaid(
      ctx.clinicId,
      appointmentId,
      ctx.actorId,
    );

    await _regeneratePaidAtClinicInvoice({
      clinicId: ctx.clinicId,
      appointment,
    });

    return NextResponse.json({ appointment }, { status: 200 });
  } catch (error) {
    if (error instanceof AppointmentRequestError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    log.error("Mark as paid failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to mark appointment as paid" },
      { status: 500 },
    );
  }
}

async function _regeneratePaidAtClinicInvoice({ clinicId, appointment }) {
  try {
    const { invoiceService } = attachInvoicePdf(createBookingServices());
    if (!invoiceService) return;
    await invoiceService.deliverForConfirmedAppointment({
      clinicId,
      appointment,
      razorpayPaymentId: null,
      forceRegenerate: true,
      sendWhatsApp: true,
    });
  } catch (err) {
    log.error("Failed to regenerate invoice after mark-as-paid", {
      clinicId,
      appointmentId: appointment.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await alertOps({
      title: "Invoice regeneration failed after mark-as-paid",
      step: OPS_ALERT_STEP.INVOICE_DELIVERY,
      error: err,
      clinicId,
      patientId: appointment.patient_id ?? null,
      extra: { appointmentId: appointment.id },
    });
  }
}
