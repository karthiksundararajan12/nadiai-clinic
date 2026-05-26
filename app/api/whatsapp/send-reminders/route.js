import { NextResponse } from "next/server";
import { checkAndSendReminders, handleNoReply } from "@/lib/whatsapp/reminder-service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * POST — Cron-like endpoint to send appointment reminders and
 * handle no-reply escalations.
 *
 * Body (optional):
 *   { doctorId: "uuid" }          — run for a specific doctor
 *   { secret: "..." }             — auth token for cron services
 *
 * If no doctorId is given, runs for all doctors with appointments today.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    if (CRON_SECRET && body.secret !== CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdminClient();
    let doctorIds = [];

    if (body.doctorId) {
      doctorIds = [body.doctorId];
    } else {
      const today = new Date().toISOString().split("T")[0];
      const { data: todayAppts } = await supabase
        .from("appointments")
        .select("doctor_id")
        .eq("date", today)
        .in("status", ["scheduled", "confirmed"]);

      doctorIds = [...new Set((todayAppts || []).map((a) => a.doctor_id))];
    }

    const results = { reminders: 0, escalations: 0, doctors: doctorIds.length };

    for (const docId of doctorIds) {
      const { reminders } = await checkAndSendReminders(docId);
      results.reminders += reminders.length;
    }

    const NO_REPLY_TIMEOUT_MS = 10 * 60 * 1000;
    const cutoff = new Date(Date.now() - NO_REPLY_TIMEOUT_MS).toISOString();

    const { data: staleConvos } = await supabase
      .from("whatsapp_conversations")
      .select("id")
      .not("state", "in", '("COMPLETED","NO_REPLY","WELCOME")')
      .lt("last_message_at", cutoff);

    for (const convo of staleConvos || []) {
      const { escalated } = await handleNoReply(convo.id);
      if (escalated) results.escalations++;
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    console.error("[SendReminders] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
