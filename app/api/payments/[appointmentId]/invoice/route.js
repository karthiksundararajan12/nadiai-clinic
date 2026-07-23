import { NextResponse } from "next/server";
import {
  InvoiceRepository,
  InvoiceStorageService,
  bookingLogger,
} from "@/features/booking";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";

const log = bookingLogger.child({
  component: "API /api/payments/[appointmentId]/invoice",
});

/**
 * GET /api/payments/[appointmentId]/invoice
 * Returns a short-lived signed URL for the booking invoice PDF.
 */
export async function GET(request, { params }) {
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
    const invoiceRepo = new InvoiceRepository(supabase);
    const invoice = await invoiceRepo.findByAppointment(ctx.clinicId, appointmentId);
    if (!invoice?.storage_path) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const storage = new InvoiceStorageService(supabase);
    const url = await storage.createSignedUrl(invoice.storage_path);

    return NextResponse.json(
      {
        url,
        invoiceNumber: invoice.invoice_number,
        appointmentId,
      },
      { status: 200 },
    );
  } catch (error) {
    log.error("Failed to create invoice signed URL", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to open invoice" },
      { status: 500 },
    );
  }
}
