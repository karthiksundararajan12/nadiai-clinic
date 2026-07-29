/**
 * @fileoverview Ops alerting — best-effort delivery of a human-visible
 * notification whenever a best-effort catch block, the WhatsApp webhook
 * handler, or a cron sweep hits a failure that would otherwise only ever
 * show up in stdout / log-aggregator output (see logger.js).
 *
 * ── Channel resolution (first configured wins) ─────────────────────────
 *   1. OPS_ALERT_SLACK_WEBHOOK_URL — POSTs `{ text }` to a Slack Incoming
 *      Webhook (https://api.slack.com/messaging/webhooks).
 *   2. OPS_ALERT_WHATSAPP_TO (+ the existing WHATSAPP_ACCESS_TOKEN, plus
 *      either OPS_ALERT_WHATSAPP_PHONE_NUMBER_ID or the existing
 *      META_PHONE_NUMBER_ID) — sends a plain-text WhatsApp message via the
 *      same Meta Cloud API path WhatsAppClientService uses.
 *
 * As of 2026-07-29, .env.local has neither configured — checked before
 * writing this module, per instruction not to assume a channel already
 * exists. Set exactly ONE of the two before the pilot doctor goes live;
 * until then every call below degrades to "logged only" (see the one-time
 * warn in `sendToOpsChannel`) instead of throwing or silently doing
 * nothing.
 *
 * ── Never throws ────────────────────────────────────────────────────────
 * This module is called from inside best-effort catch blocks and a
 * top-level webhook error boundary — both already handling a failure. A
 * broken alert channel (bad webhook URL, Meta rate limit, network blip)
 * must never compound that original failure or introduce a new unhandled
 * rejection. Every exported function catches and logs internally instead
 * of rethrowing.
 *
 * ── ops_alerts audit trail (migration 032) ─────────────────────────────
 * Every `alertOps` call also best-effort inserts a row into
 * `public.ops_alerts`, independent of whether delivery to the channel
 * itself succeeded. This is what DailyDigestService queries to report
 * "N vaccination-seed failures / N webhook errors yesterday" — see that
 * file — so counts are always available even on the many days no doctor is
 * around to read a chat message.
 */

import { createLogger } from "../logger.js";
import { getSupabaseAdminClient } from "../../../lib/supabase/admin.js";

const log = createLogger({ component: "OpsAlerting" });
const FETCH_TIMEOUT_MS = 5000;
const DEFAULT_WHATSAPP_API_VERSION = "v21.0";

/**
 * Canonical `step` values passed to alertOps(), also used by
 * DailyDigestService to bucket yesterday's ops_alerts rows into the
 * digest's summary sections. Keeping these centralized avoids a typo'd
 * step string silently falling out of every digest bucket.
 */
export const OPS_ALERT_STEP = Object.freeze({
  VACCINATION_SEED:              "vaccination_seed",
  VACCINATION_REMINDER_CLAIM:    "vaccination_reminder_claim",
  VACCINATION_REMINDER_SEND:     "vaccination_reminder_send",
  VACCINATION_REMINDER_REVERT:   "vaccination_reminder_revert",
  VACCINATION_REMINDER_EXHAUSTED: "vaccination_reminder_exhausted",
  VACCINATION_OVERDUE_SWEEP:     "vaccination_overdue_sweep",
  WHATSAPP_SEND:                 "whatsapp_send",
  WHATSAPP_WEBHOOK_MESSAGE:      "whatsapp_webhook_message",
  WHATSAPP_WEBHOOK_TOP_LEVEL:    "whatsapp_webhook_top_level",
  WHATSAPP_WEBHOOK_FALLBACK_REPLY_FAILED: "whatsapp_webhook_fallback_reply_failed",
  RAZORPAY_SEND:                 "razorpay_send",
  INVOICE_DELIVERY:              "invoice_delivery",
  IN_APP_NOTIFICATION:           "in_app_notification",
  CONVERSATION_STATE_ADVANCE:    "conversation_state_advance",
  DOCTOR_HANDOFF_LOOKUP:         "doctor_handoff_lookup",
  DOCTOR_HANDOFF_SEND:           "doctor_handoff_send",
  APPOINTMENT_LOOKUP:            "appointment_lookup",
  APPOINTMENT_CANCEL:            "appointment_cancel",
  REMINDER_SWEEP:                "reminder_sweep",
  REMINDER_CLAIM:                "reminder_claim",
  REMINDER_SEND:                 "reminder_send",
  REFUND:                        "refund",
});

/** Buckets consumed by DailyDigestService — see that file. */
export const VACCINATION_SEED_FAILURE_STEPS = Object.freeze([
  OPS_ALERT_STEP.VACCINATION_SEED,
  OPS_ALERT_STEP.VACCINATION_REMINDER_CLAIM,
  OPS_ALERT_STEP.VACCINATION_REMINDER_SEND,
  OPS_ALERT_STEP.VACCINATION_REMINDER_REVERT,
  OPS_ALERT_STEP.VACCINATION_REMINDER_EXHAUSTED,
  OPS_ALERT_STEP.VACCINATION_OVERDUE_SWEEP,
]);

export const WEBHOOK_ERROR_STEPS = Object.freeze([
  OPS_ALERT_STEP.WHATSAPP_WEBHOOK_MESSAGE,
  OPS_ALERT_STEP.WHATSAPP_WEBHOOK_TOP_LEVEL,
  OPS_ALERT_STEP.WHATSAPP_WEBHOOK_FALLBACK_REPLY_FAILED,
]);

export const WHATSAPP_SEND_FAILURE_STEPS = Object.freeze([OPS_ALERT_STEP.WHATSAPP_SEND]);

let warnedNoChannelConfigured = false;

function withTimeoutSignal(ms) {
  if (typeof AbortController === "undefined") return { signal: undefined, cancel: () => {} };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

async function postSlackMessage(webhookUrl, text) {
  const { signal, cancel } = withTimeoutSignal(FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
    if (!response.ok) {
      throw new Error(`Slack webhook responded ${response.status}`);
    }
  } finally {
    cancel();
  }
}

async function postWhatsAppAlert(text, { to, accessToken, phoneNumberId, apiVersion }) {
  const { signal, cancel } = withTimeoutSignal(FETCH_TIMEOUT_MS);
  try {
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text, preview_url: false },
      }),
      signal,
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(
        `WhatsApp alert send responded ${response.status}: ${payload?.error?.message ?? "unknown error"}`,
      );
    }
  } finally {
    cancel();
  }
}

/**
 * @returns {{ kind: "slack", webhookUrl: string }
 *   | { kind: "whatsapp", to: string, accessToken: string, phoneNumberId: string, apiVersion: string }
 *   | null}
 */
function resolveChannel() {
  const webhookUrl = process.env.OPS_ALERT_SLACK_WEBHOOK_URL?.trim();
  if (webhookUrl) return { kind: "slack", webhookUrl };

  const to = process.env.OPS_ALERT_WHATSAPP_TO?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId =
    process.env.OPS_ALERT_WHATSAPP_PHONE_NUMBER_ID?.trim() || process.env.META_PHONE_NUMBER_ID?.trim();
  if (to && accessToken && phoneNumberId) {
    return {
      kind: "whatsapp",
      to,
      accessToken,
      phoneNumberId,
      apiVersion: process.env.WHATSAPP_API_VERSION?.trim() || DEFAULT_WHATSAPP_API_VERSION,
    };
  }
  return null;
}

/**
 * Sends free-form text to whichever ops channel is configured. Never
 * throws — see file header.
 *
 * @param {string} text
 * @returns {Promise<{ sent: boolean; channel: "slack"|"whatsapp"|"none" }>}
 */
export async function sendToOpsChannel(text) {
  const channel = resolveChannel();
  if (!channel) {
    if (!warnedNoChannelConfigured) {
      warnedNoChannelConfigured = true;
      log.warn(
        "No ops alert channel configured — set OPS_ALERT_SLACK_WEBHOOK_URL or OPS_ALERT_WHATSAPP_TO in .env.local. Alerts are only being logged until then.",
      );
    }
    return { sent: false, channel: "none" };
  }

  try {
    if (channel.kind === "slack") {
      await postSlackMessage(channel.webhookUrl, text);
    } else {
      await postWhatsAppAlert(text, channel);
    }
    return { sent: true, channel: channel.kind };
  } catch (err) {
    log.error("Failed to deliver message to the configured ops alert channel", {
      channel: channel.kind,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: false, channel: channel.kind };
  }
}

function formatAlertText({ title, clinicId, patientId, contactPhone, step, errorMessage, extra }) {
  const lines = [`\u{1F6A8} ${title}`, `Step: ${step}`];
  if (clinicId) lines.push(`Clinic: ${clinicId}`);
  if (patientId) lines.push(`Patient: ${patientId}`);
  if (contactPhone) lines.push(`Contact: ${contactPhone}`);
  if (errorMessage) lines.push(`Error: ${errorMessage}`);
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value == null) continue;
    lines.push(`${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  lines.push(`Time (UTC): ${new Date().toISOString()}`);
  return lines.join("\n");
}

/**
 * Best-effort insert into public.ops_alerts (migration 032) so
 * DailyDigestService can report concrete counts instead of grepping logs.
 * Never throws — a missing table / RLS issue must not prevent the alert
 * text itself from being sent, and must not compound the original error.
 */
async function recordOpsAlert({ step, title, clinicId, patientId, contactPhone, errorMessage, extra, channel, delivered }) {
  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("ops_alerts").insert({
      step,
      title,
      clinic_id: clinicId ?? null,
      patient_id: patientId ?? null,
      contact_phone: contactPhone ?? null,
      error_message: errorMessage ?? null,
      extra: extra ?? {},
      channel,
      delivered,
    });
    if (error) {
      log.error("Failed to record ops alert row (non-fatal)", { step, error: error.message });
    }
  } catch (err) {
    log.error("Failed to record ops alert row (non-fatal)", {
      step,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fires a best-effort ops alert for a failure that would otherwise only be
 * logged. NEVER throws — safe to `await` directly inside any catch block
 * without a nested try/catch around it.
 *
 * @param {{
 *   title?: string;
 *   step: string;
 *   error: unknown;
 *   clinicId?: string|null;
 *   patientId?: string|null;
 *   contactPhone?: string|null;
 *   extra?: Record<string, unknown>;
 * }} params
 * @returns {Promise<void>}
 */
export async function alertOps({
  title = "Nadi AI booking bot — failure",
  step,
  error,
  clinicId = null,
  patientId = null,
  contactPhone = null,
  extra = {},
}) {
  const errorMessage = error instanceof Error ? error.message : error == null ? undefined : String(error);
  const text = formatAlertText({ title, clinicId, patientId, contactPhone, step, errorMessage, extra });

  const { sent, channel } = await sendToOpsChannel(text);
  await recordOpsAlert({ step, title, clinicId, patientId, contactPhone, errorMessage, extra, channel, delivered: sent });
}
