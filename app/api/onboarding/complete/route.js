import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      full_name,
      specialization,
      license_number,
      phone,
      clinic_name,
      clinic_address,
      consultation_duration,
      working_hours_start,
      working_hours_end,
    } = body;

    if (!full_name || !specialization || !phone || !clinic_name) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();

    const { data: existingProfile } = await admin
      .from("doctor_profiles")
      .select("clinic_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let clinicId = existingProfile?.clinic_id;

    const clinicPayload = { name: clinic_name };

    if (clinicId) {
      const { error: clinicErr } = await admin
        .from("clinics")
        .update(clinicPayload)
        .eq("id", clinicId);

      if (clinicErr) {
        return NextResponse.json({ error: clinicErr.message }, { status: 500 });
      }
    } else {
      const { data: clinic, error: clinicErr } = await admin
        .from("clinics")
        .insert(clinicPayload)
        .select("id")
        .single();

      if (clinicErr || !clinic) {
        return NextResponse.json(
          { error: clinicErr?.message || "Failed to create clinic" },
          { status: 500 }
        );
      }

      clinicId = clinic.id;
    }

    const { error: profileErr } = await admin.from("doctor_profiles").upsert(
      {
        user_id: user.id,
        email: user.email,
        full_name,
        specialization,
        license_number: license_number || null,
        phone,
        clinic_name,
        clinic_address: clinic_address || null,
        consultation_duration: parseInt(consultation_duration, 10) || 30,
        working_hours_start: working_hours_start || "09:00",
        working_hours_end: working_hours_end || "18:00",
        clinic_id: clinicId,
        onboarding_complete: true,
      },
      { onConflict: "user_id" }
    );

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, clinicId });
  } catch (err) {
    console.error("[Onboarding] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
