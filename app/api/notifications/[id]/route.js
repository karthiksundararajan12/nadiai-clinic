import { NextResponse } from "next/server";
import {
  NotificationRepository,
  InAppNotificationService,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";

const log = bookingLogger.child({ component: "API /api/notifications/[id]" });

function createNotificationService() {
  const supabase = getSupabaseAdminClient();
  return new InAppNotificationService(
    new NotificationRepository(supabase),
    new PatientRepository(supabase),
  );
}

/**
 * GET /api/notifications/[id] — single clinic-scoped notification.
 */
export async function GET(request, { params }) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Missing notification id" }, { status: 400 });
    }

    const service = createNotificationService();
    const notification = await service.getById(ctx.clinicId, id);
    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 });
    }

    return NextResponse.json({ notification }, { status: 200 });
  } catch (error) {
    log.error("Failed to fetch notification", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to fetch notification" },
      { status: 500 },
    );
  }
}
