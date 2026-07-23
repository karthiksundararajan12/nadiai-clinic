import { NextResponse } from "next/server";
import {
  PaymentRepository,
  PaymentsService,
  bookingLogger,
} from "@/features/booking";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";

const log = bookingLogger.child({ component: "API /api/payments" });

/**
 * GET /api/payments?search=&status=&range=&from=&to=&limit=&offset=
 *
 * Source of truth: appointments.payment_* (+ booking_invoices for PDF/number).
 */
export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search");
    const status = searchParams.get("status") ?? "all";
    const range = searchParams.get("range") ?? "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const limitParam = Number(searchParams.get("limit"));
    const offsetParam = Number(searchParams.get("offset"));
    const limit = Number.isFinite(limitParam) ? limitParam : 20;
    const offset = Number.isFinite(offsetParam) ? offsetParam : 0;

    const supabase = getSupabaseAdminClient();
    const service = new PaymentsService(new PaymentRepository(supabase));
    const result = await service.list(ctx.clinicId, {
      search,
      status,
      range,
      from,
      to,
      limit,
      offset,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    log.error("Failed to list payments", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to list payments" },
      { status: 500 },
    );
  }
}
