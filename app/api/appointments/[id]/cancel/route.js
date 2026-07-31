/**
 * POST /api/appointments/[id]/cancel
 *
 * Doctor-initiated cancel for a CONFIRMED appointment. Reuses the shared
 * AppointmentCancelRefundService pipeline (same refund + patient WhatsApp
 * ack + in-app notify as the WhatsApp reminder Cancel button), with
 * cancellation_reason = doctor_cancelled_dashboard.
 */

import { NextResponse } from "next/server";
import {
  createBookingServices,
  bookingLogger,
  APPOINTMENT_STATUS,
} from "@/features/booking";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";

const log = bookingLogger.child({
  component: "API /api/appointments/[id]/cancel",
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

    const {
      clinicRepository,
      appointmentRepository,
      appointmentCancelRefundService,
    } = createBookingServices();

    const existing = await appointmentRepository.findByIdForClinic(
      ctx.clinicId,
      appointmentId,
    );
    if (!existing) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
    if (existing.status !== APPOINTMENT_STATUS.CONFIRMED) {
      return NextResponse.json(
        {
          error: "Only confirmed appointments can be cancelled",
          code: "NOT_CONFIRMED",
          status: existing.status,
        },
        { status: 409 },
      );
    }

    const clinic = await clinicRepository.findById(ctx.clinicId);
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const appointment = await appointmentCancelRefundService.cancelFromDoctorDashboard({
      clinic,
      appointmentId,
      log: log.child({ clinicId: ctx.clinicId, appointmentId }),
    });

    if (!appointment) {
      return NextResponse.json(
        {
          error: "Appointment cannot be cancelled in its current state",
          code: "NOT_CONFIRMED",
        },
        { status: 409 },
      );
    }

    return NextResponse.json({ appointment }, { status: 200 });
  } catch (error) {
    log.error("Doctor dashboard cancel failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to cancel appointment" },
      { status: 500 },
    );
  }
}
