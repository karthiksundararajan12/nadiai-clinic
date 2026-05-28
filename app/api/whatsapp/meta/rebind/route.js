import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { WHATSAPP_SETUP_STATUS } from "@/lib/whatsapp/clinic-setup";

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const clinicId = body.clinicId || body.clinic_id;
    const phoneNumberId = body.phoneNumberId || body.phone_number_id;

    if (!clinicId || !phoneNumberId) {
      return NextResponse.json(
        { error: "clinicId and phoneNumberId are required" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("clinics")
      .update({
        whatsapp_provider: "meta",
        whatsapp_phone_number_id: String(phoneNumberId),
        whatsapp_business_account_id: body.wabaId || body.waba_id || null,
        whatsapp_display_number:
          body.displayPhoneNumber || body.display_phone_number || null,
        whatsapp_setup_status: WHATSAPP_SETUP_STATUS.ACTIVE,
        whatsapp_verified_at: new Date().toISOString(),
        whatsapp_setup_error: null,
      })
      .eq("id", clinicId)
      .select(
        "id, name, whatsapp_provider, whatsapp_display_number, whatsapp_phone_number_id, whatsapp_business_account_id, whatsapp_setup_status, whatsapp_verified_at, whatsapp_setup_error"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await admin.from("whatsapp_setup_audit_logs").insert({
      clinic_id: clinicId,
      action: "admin_rebind",
      status: "success",
      metadata: {
        phone_number_id: String(phoneNumberId),
        waba_id: body.wabaId || body.waba_id || null,
      },
    });

    return NextResponse.json({ success: true, clinic: data });
  } catch (err) {
    console.error("[Meta Rebind] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

function isAuthorized(request) {
  const expected = process.env.META_ADMIN_SETUP_TOKEN;
  if (!expected) return false;

  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.replace(/^Bearer\s+/i, "");
  const setupToken = request.headers.get("x-setup-token");

  return bearer === expected || setupToken === expected;
}
