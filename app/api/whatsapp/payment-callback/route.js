import { NextResponse } from "next/server";
import { processPaymentCallback } from "@/lib/whatsapp/payment-handler";
import { handlePaymentConfirmed } from "@/lib/whatsapp/bot-engine";
import { notifyDoctor } from "@/lib/whatsapp/notification-service";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST — Receives payment confirmation from payment gateway callback.
 *
 * Expected body:
 *   { paymentId: "uuid", status: "paid", paymentMode: "UPI" }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { paymentId, status, paymentMode } = body;

    if (!paymentId || !status) {
      return NextResponse.json(
        { error: "Missing paymentId or status" },
        { status: 400 }
      );
    }

    const result = await processPaymentCallback(paymentId, status, paymentMode);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    const isPaid = status === "paid" || status === "success";

    if (isPaid && result.payment.appointment_id) {
      const supabase = getSupabaseAdminClient();

      const { data: convo } = await supabase
        .from("whatsapp_conversations")
        .select("id, doctor_id")
        .eq("appointment_id", result.payment.appointment_id)
        .single();

      if (convo) {
        await handlePaymentConfirmed(convo.id);

        await notifyDoctor(convo.doctor_id, {
          type: "payment_received",
          message: `Payment of ₹${result.payment.amount} received from ${result.payment.patient_name} via ${paymentMode || "online"}`,
          metadata: {
            payment_id: paymentId,
            amount: result.payment.amount,
            patient_name: result.payment.patient_name,
            patient_phone: result.payment.patient_phone,
            payment_mode: paymentMode,
            appointment_id: result.payment.appointment_id,
            paid_at: new Date().toISOString(),
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      status: result.payment.status,
    });
  } catch (err) {
    console.error("[PaymentCallback] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
