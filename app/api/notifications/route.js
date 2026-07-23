import { NextResponse } from "next/server";
import {
  NotificationRepository,
  InAppNotificationService,
  PatientRepository,
  bookingLogger,
} from "@/features/booking";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveRequestContext } from "@/app/api/scribe/_helpers/context";

const log = bookingLogger.child({ component: "API /api/notifications" });

function createNotificationService() {
  const supabase = getSupabaseAdminClient();
  return new InAppNotificationService(
    new NotificationRepository(supabase),
    new PatientRepository(supabase),
  );
}

/**
 * GET /api/notifications — paginated notifications for the doctor's clinic
 * (newest first) plus unreadCount / hasMore.
 * Query: ?limit=20&offset=0
 */
export async function GET(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const limitParam = Number(searchParams.get("limit"));
    const offsetParam = Number(searchParams.get("offset"));
    const limit = Number.isFinite(limitParam) ? limitParam : 20;
    const offset = Number.isFinite(offsetParam) ? offsetParam : 0;

    const service = createNotificationService();
    const result = await service.listForClinic(ctx.clinicId, { limit, offset });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    log.error("Failed to list notifications", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to list notifications" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/notifications — mark one notification read, or mark all read.
 * Body: { id: string } | { markAllRead: true }
 */
export async function PATCH(request) {
  try {
    const ctx = await resolveRequestContext(request);
    if (!ctx) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const service = createNotificationService();

    if (body.markAllRead === true) {
      const updated = await service.markAllRead(ctx.clinicId);
      return NextResponse.json({ ok: true, updated }, { status: 200 });
    }

    if (typeof body.id === "string" && body.id.length > 0) {
      const notification = await service.markRead(ctx.clinicId, body.id);
      if (!notification) {
        return NextResponse.json({ error: "Notification not found" }, { status: 404 });
      }
      return NextResponse.json({ ok: true, notification }, { status: 200 });
    }

    return NextResponse.json(
      { error: "Request must include id or markAllRead: true" },
      { status: 400 },
    );
  } catch (error) {
    log.error("Failed to update notifications", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 },
    );
  }
}
