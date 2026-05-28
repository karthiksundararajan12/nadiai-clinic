import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  parsePhoneForMeta,
  WHATSAPP_SETUP_STATUS,
} from "@/lib/whatsapp/clinic-setup";
import {
  addPhoneNumberToWaba,
  getMetaAccessToken,
  registerPhoneNumber,
  requestPhoneVerificationCode,
  subscribeWabaToWebhooks,
  verifyPhoneVerificationCode,
} from "@/lib/whatsapp/meta-cloud";

export async function POST(request) {
  try {
    const { user, clinic } = await getCurrentClinic();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!clinic) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const body = await request.json();
    const action = body.action || "request_otp";
    const token = getMetaAccessToken();
    const wabaId =
      body.wabaId ||
      body.waba_id ||
      clinic.whatsapp_business_account_id ||
      process.env.META_WABA_ID ||
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

    if (!token || !wabaId) {
      return NextResponse.json(
        { error: "Missing Meta token or WABA id" },
        { status: 500 }
      );
    }

    if (action === "request_otp") {
      return await requestOtp({ clinic, token, wabaId, body });
    }

    if (action === "verify_otp") {
      return await verifyOtp({ clinic, token, wabaId, body });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[Meta OTP] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function requestOtp({ clinic, token, wabaId, body }) {
  const admin = getSupabaseAdminClient();
  const phone = parsePhoneForMeta(
    body.whatsapp_display_number || clinic.whatsapp_display_number
  );

  if (!phone) {
    return NextResponse.json(
      { error: "Clinic WhatsApp number is required" },
      { status: 400 }
    );
  }

  const sameNumber = phone.display === clinic.whatsapp_display_number;
  let phoneNumberId = sameNumber ? clinic.whatsapp_phone_number_id : null;
  if (!phoneNumberId) {
    const added = await addPhoneNumberToWaba(
      wabaId,
      token,
      phone,
      clinic.name,
      { migrate: Boolean(body.migrate_phone_number) }
    );

    if (!added.success) {
      await markClinicFailed(admin, clinic.id, added.error);
      return NextResponse.json({ error: added.error }, { status: 502 });
    }

    phoneNumberId = added.phoneNumberId;
  }

  const otp = await requestPhoneVerificationCode(
    phoneNumberId,
    token,
    body.otpMethod || body.otp_method || "SMS"
  );

  if (!otp.success) {
    await markClinicFailed(admin, clinic.id, otp.error);
    return NextResponse.json({ error: otp.error }, { status: 502 });
  }

  const { data, error } = await admin
    .from("clinics")
    .update({
      whatsapp_provider: "meta",
      whatsapp_display_number: phone.display,
      whatsapp_business_account_id: String(wabaId),
      whatsapp_phone_number_id: String(phoneNumberId),
      whatsapp_setup_status: WHATSAPP_SETUP_STATUS.PENDING_VERIFICATION,
      whatsapp_setup_requested_at: new Date().toISOString(),
      whatsapp_verified_at: null,
      whatsapp_setup_error: null,
    })
    .eq("id", clinic.id)
    .select(
      "id, name, whatsapp_provider, whatsapp_display_number, whatsapp_phone_number_id, whatsapp_business_account_id, meta_business_id, whatsapp_setup_status, whatsapp_verified_at, whatsapp_setup_error"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, setup: data });
}

async function verifyOtp({ clinic, token, wabaId, body }) {
  const admin = getSupabaseAdminClient();
  const phoneNumberId = clinic.whatsapp_phone_number_id;
  const otpCode = body.otpCode || body.otp_code;

  if (!phoneNumberId || !otpCode) {
    return NextResponse.json(
      { error: "Phone number id and OTP code are required" },
      { status: 400 }
    );
  }

  const verified = await verifyPhoneVerificationCode(
    phoneNumberId,
    token,
    otpCode
  );
  if (verified.success === false) {
    await markClinicFailed(admin, clinic.id, verified.error);
    return NextResponse.json({ error: verified.error }, { status: 502 });
  }

  const subscription = await subscribeWabaToWebhooks(wabaId, token);
  if (!subscription.success) {
    await markClinicFailed(admin, clinic.id, subscription.error);
    return NextResponse.json({ error: subscription.error }, { status: 502 });
  }

  const registration = await registerPhoneNumber(phoneNumberId, token);
  if (registration.success === false) {
    await markClinicFailed(admin, clinic.id, registration.error);
    return NextResponse.json({ error: registration.error }, { status: 502 });
  }

  const { data, error } = await admin
    .from("clinics")
    .update({
      whatsapp_provider: "meta",
      whatsapp_business_account_id: String(wabaId),
      whatsapp_setup_status: WHATSAPP_SETUP_STATUS.ACTIVE,
      whatsapp_verified_at: new Date().toISOString(),
      whatsapp_setup_error: null,
    })
    .eq("id", clinic.id)
    .select(
      "id, name, whatsapp_provider, whatsapp_display_number, whatsapp_phone_number_id, whatsapp_business_account_id, meta_business_id, whatsapp_setup_status, whatsapp_verified_at, whatsapp_setup_error"
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, setup: data });
}

async function getCurrentClinic() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, clinic: null };

  const admin = getSupabaseAdminClient();
  const { data: profile } = await admin
    .from("doctor_profiles")
    .select("clinic_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.clinic_id) return { user, clinic: null };

  const { data: clinic } = await admin
    .from("clinics")
    .select(
      "id, name, whatsapp_display_number, whatsapp_phone_number_id, whatsapp_business_account_id"
    )
    .eq("id", profile.clinic_id)
    .single();

  return { user, clinic };
}

async function markClinicFailed(admin, clinicId, error) {
  await admin
    .from("clinics")
    .update({
      whatsapp_setup_status: WHATSAPP_SETUP_STATUS.FAILED,
      whatsapp_setup_error: error,
    })
    .eq("id", clinicId);
}
