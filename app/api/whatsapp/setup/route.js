import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildMetaWebhookUrl,
  normalizeIndianPhoneNumber,
  WHATSAPP_SETUP_STATUS,
} from "@/lib/whatsapp/clinic-setup";

export async function GET(request) {
  try {
    const { user, clinicId } = await getCurrentClinic();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!clinicId) {
      return NextResponse.json({ setup: null });
    }

    const admin = getSupabaseAdminClient();
    const { data: clinic, error } = await admin
      .from("clinics")
      .select(
        "id, name, whatsapp_provider, whatsapp_display_number, whatsapp_phone_number_id, whatsapp_business_account_id, meta_business_id, whatsapp_setup_status, whatsapp_setup_requested_at, whatsapp_verified_at, whatsapp_setup_error"
      )
      .eq("id", clinicId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const origin = new URL(request.url).origin;
    const webhookUrl = buildMetaWebhookUrl(origin);

    return NextResponse.json({
      setup: {
        ...clinic,
        meta_webhook_url: webhookUrl,
      },
    });
  } catch (err) {
    console.error("[WhatsApp Setup] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { user, clinicId } = await getCurrentClinic();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!clinicId) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const body = await request.json();
    const whatsappNumber = normalizeIndianPhoneNumber(
      body.whatsapp_display_number
    );

    if (!whatsappNumber) {
      return NextResponse.json(
        { error: "WhatsApp number is required" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();

    const { data, error } = await admin
      .from("clinics")
      .update({
        whatsapp_provider: "meta",
        whatsapp_display_number: whatsappNumber,
        whatsapp_phone_number_id: null,
        whatsapp_business_account_id: null,
        meta_business_id: null,
        whatsapp_setup_status: WHATSAPP_SETUP_STATUS.PENDING_VERIFICATION,
        whatsapp_setup_requested_at: new Date().toISOString(),
        whatsapp_verified_at: null,
        whatsapp_setup_error: null,
      })
      .eq("id", clinicId)
      .select(
        "id, name, whatsapp_provider, whatsapp_display_number, whatsapp_phone_number_id, whatsapp_business_account_id, meta_business_id, whatsapp_setup_status, whatsapp_setup_requested_at, whatsapp_verified_at, whatsapp_setup_error"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ setup: data });
  } catch (err) {
    console.error("[WhatsApp Setup] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function getCurrentClinic() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, clinicId: null };

  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from("doctor_profiles")
    .select("clinic_id")
    .eq("user_id", user.id)
    .single();

  return { user, clinicId: profile?.clinic_id || null };
}
