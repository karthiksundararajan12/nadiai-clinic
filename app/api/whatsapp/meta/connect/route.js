import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizeIndianPhoneNumber, WHATSAPP_SETUP_STATUS } from "@/lib/whatsapp/clinic-setup";
import {
  getMetaAccessToken,
  getPhoneNumberDetails,
  registerPhoneNumber,
  requestPhoneVerificationCode,
  subscribeWabaToWebhooks,
  verifyPhoneVerificationCode,
} from "@/lib/whatsapp/meta-cloud";

export async function POST(request) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const admin = getSupabaseAdminClient();

    const clinicId = body.clinicId || body.clinic_id;
    if (!clinicId) {
      return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
    }

    const wabaId = body.wabaId || body.waba_id;
    const phoneNumberId = body.phoneNumberId || body.phone_number_id;
    const businessId = body.businessId || body.business_id || null;

    if (!wabaId || !phoneNumberId) {
      await markClinicFailed(admin, clinicId, "Missing WABA or phone number id");
      return NextResponse.json(
        { error: "Missing WABA or phone number id" },
        { status: 400 }
      );
    }

    await admin
      .from("clinics")
      .update({
        whatsapp_provider: "meta",
        whatsapp_business_account_id: String(wabaId),
        whatsapp_phone_number_id: String(phoneNumberId),
        meta_business_id: businessId ? String(businessId) : null,
        whatsapp_setup_status: WHATSAPP_SETUP_STATUS.PENDING_VERIFICATION,
        whatsapp_setup_error: null,
      })
      .eq("id", clinicId);

    const token = getMetaAccessToken(body.accessToken || body.access_token);

    if (!token) {
      await markClinicFailed(admin, clinicId, "Missing Meta access token");
      return NextResponse.json(
        { error: "Missing Meta access token" },
        { status: 500 }
      );
    }

    const phoneDetails = await getPhoneNumberDetails(phoneNumberId, token);
    const displayNumber =
      normalizeIndianPhoneNumber(body.displayPhoneNumber || body.display_phone_number) ||
      normalizeIndianPhoneNumber(phoneDetails?.display_phone_number);

    if (body.requestOtp || body.request_otp) {
      const otp = await requestPhoneVerificationCode(
        phoneNumberId,
        token,
        body.otpMethod || body.otp_method || "SMS"
      );
      if (!otp.success) {
        await markClinicFailed(admin, clinicId, otp.error);
        return NextResponse.json({ error: otp.error }, { status: 502 });
      }
      return NextResponse.json({
        success: true,
        status: WHATSAPP_SETUP_STATUS.PENDING_VERIFICATION,
      });
    }

    if (body.otpCode || body.otp_code) {
      const verified = await verifyPhoneVerificationCode(
        phoneNumberId,
        token,
        body.otpCode || body.otp_code
      );
      if (verified.success === false) {
        await markClinicFailed(admin, clinicId, verified.error);
        return NextResponse.json({ error: verified.error }, { status: 502 });
      }
    }

    const subscription = await subscribeWabaToWebhooks(wabaId, token);
    if (!subscription.success) {
      await markClinicFailed(admin, clinicId, subscription.error);
      return NextResponse.json({ error: subscription.error }, { status: 502 });
    }

    const registration = await registerPhoneNumber(phoneNumberId, token);
    if (registration.success === false) {
      await markClinicFailed(admin, clinicId, registration.error);
      return NextResponse.json({ error: registration.error }, { status: 502 });
    }

    const { data: clinic, error } = await admin
      .from("clinics")
      .update({
        whatsapp_provider: "meta",
        whatsapp_display_number: displayNumber || null,
        whatsapp_business_account_id: String(wabaId),
        whatsapp_phone_number_id: String(phoneNumberId),
        meta_business_id: businessId ? String(businessId) : null,
        whatsapp_setup_status: WHATSAPP_SETUP_STATUS.ACTIVE,
        whatsapp_verified_at: new Date().toISOString(),
        whatsapp_setup_error: null,
      })
      .eq("id", clinicId)
      .select(
        "id, name, whatsapp_provider, whatsapp_display_number, whatsapp_phone_number_id, whatsapp_business_account_id, meta_business_id, whatsapp_setup_status, whatsapp_verified_at, whatsapp_setup_error"
      )
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, clinic });
  } catch (err) {
    console.error("[Meta Connect] Error:", err);
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

async function markClinicFailed(admin, clinicId, error) {
  await admin
    .from("clinics")
    .update({
      whatsapp_setup_status: WHATSAPP_SETUP_STATUS.FAILED,
      whatsapp_setup_error: error,
    })
    .eq("id", clinicId);
}
