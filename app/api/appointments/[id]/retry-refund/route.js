/**
 * POST /api/appointments/[id]/retry-refund
 *
 * Doctor-initiated retry of a failed Razorpay refund. Only allowed when
 * refund_status = failed and a captured payment id is still on the row.
 * Does not re-cancel or re-send patient/doctor cancel notifications.
 */

import { NextResponse } from "next/server";
import {
  createBookingServices,
  bookingLogger,
  RefundRetryError,
  RazorpaySendError,
} from "@/features/booking";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";

const log = bookingLogger.child({
  component: "API /api/appointments/[id]/retry-refund",
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
      appointmentCancelRefundService,
    } = createBookingServices();

    const clinic = await clinicRepository.findById(ctx.clinicId);
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const appointment = await appointmentCancelRefundService.retryFailedRefund({
      clinic,
      appointmentId,
      log: log.child({ clinicId: ctx.clinicId, appointmentId }),
    });

    return NextResponse.json({ appointment }, { status: 200 });
  } catch (error) {
    if (error instanceof RefundRetryError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.statusCode },
      );
    }
    if (error instanceof RazorpaySendError) {
      log.error("Retry refund failed at Razorpay", {
        error: error.message,
        details: error.details,
      });
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          hint:
            error.details && typeof error.details === "object"
              ? error.details.hint ?? null
              : null,
        },
        { status: 502 },
      );
    }
    log.error("Retry refund failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to retry refund" },
      { status: 500 },
    );
  }
}
