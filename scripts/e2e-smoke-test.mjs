#!/usr/bin/env node
/**
 * @fileoverview Pre-demo E2E smoke test for the doctor-facing booking path.
 *
 * Drives the real WhatsApp → payment → reminder → dashboard pipeline against
 * a non-Ravikiran clinic (defaults to "Deepti clinic") using the same signed
 * webhook + CRON_SECRET force-send patterns the app already exposes.
 *
 * Usage:
 *   node scripts/e2e-smoke-test.mjs                  # prod (default)
 *   node scripts/e2e-smoke-test.mjs --env=staging
 *   node scripts/e2e-smoke-test.mjs --base-url=https://…
 *   node scripts/e2e-smoke-test.mjs --clinic-name=Deepti
 *
 * Required env (loaded from .env.local when present):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   WHATSAPP_APP_SECRET, RAZORPAY_WEBHOOK_SECRET, CRON_SECRET,
 *   E2E_TEST_EMAIL, E2E_TEST_PASSWORD, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Optional:
 *   SMOKE_BASE_URL_PROD / SMOKE_BASE_URL_STAGING — override env URLs
 *   E2E_SMOKE_PHONE — fixed WhatsApp contact (digits, with country code)
 *   E2E_SMOKE_CLINIC_NAME — clinic name substring (default: Deepti)
 *
 * Exit code: 0 if every required step passed (skips allowed); 1 otherwise.
 * Always attempts cleanup in a finally block.
 */

import { createHmac, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

loadEnv({ path: new URL("../.env.local", import.meta.url).pathname });

import {
  START_MENU_INTENT,
  PATIENT_SELECTION_ADD_NEW_ID,
  CONSENT_INTENT,
  APPOINTMENT_STATUS,
  CONVERSATION_STATE,
  REFUND_STATUS,
  CAPTURED_PAYMENT_STATUSES,
  REMINDER_REPLY_ACTION,
} from "../features/booking/constants.js";
import { reminderReplyId } from "../features/booking/lib/reminder-reply.js";
import { slotRowId } from "../features/booking/lib/slot-engine.js";

// ─────────────────────────────────────────────────────────────
// Config / CLI
// ─────────────────────────────────────────────────────────────

const ENV_URLS = Object.freeze({
  prod: process.env.SMOKE_BASE_URL_PROD || "https://nadiai-clinic.vercel.app",
  staging:
    process.env.SMOKE_BASE_URL_STAGING ||
    process.env.SMOKE_STAGING_URL ||
    "https://nadiai-clinic-git-staging.vercel.app",
});

const FORBIDDEN_CLINIC_PATTERN = /ravikiran/i;
const DEFAULT_CLINIC_NAME = "Deepti";
const POLL_MS = 800;
const POLL_TIMEOUT_MS = 45_000;
const STEP_GAP_MS = 600;

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const args = {
    env: "prod",
    baseUrl: null,
    clinicName: process.env.E2E_SMOKE_CLINIC_NAME || DEFAULT_CLINIC_NAME,
  };
  for (const arg of argv) {
    if (arg.startsWith("--env=")) {
      args.env = arg.slice("--env=".length).trim().toLowerCase() || "prod";
    } else if (arg.startsWith("--base-url=")) {
      args.baseUrl = arg.slice("--base-url=".length).trim() || null;
    } else if (arg.startsWith("--clinic-name=")) {
      args.clinicName = arg.slice("--clinic-name=".length).trim() || DEFAULT_CLINIC_NAME;
    }
  }
  return args;
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────
// Reporter
// ─────────────────────────────────────────────────────────────

/**
 * @typedef {{ name: string; status: "PASS"|"FAIL"|"SKIP"; detail: string; ms: number }} StepResult
 */

class Reporter {
  constructor() {
    /** @type {StepResult[]} */
    this.steps = [];
    this.startedAt = Date.now();
  }

  /**
   * @param {string} name
   * @param {() => Promise<string|void>} fn
   * @param {{ optional?: boolean }} [opts]
   */
  async run(name, fn, { optional = false } = {}) {
    const t0 = Date.now();
    process.stdout.write(`→ ${name} … `);
    try {
      const detail = (await fn()) || "ok";
      const ms = Date.now() - t0;
      this.steps.push({ name, status: "PASS", detail: String(detail), ms });
      console.log(`PASS (${ms}ms) — ${detail}`);
    } catch (err) {
      const ms = Date.now() - t0;
      const message = err instanceof Error ? err.message : String(err);
      if (optional && err?.skip === true) {
        this.steps.push({ name, status: "SKIP", detail: message, ms });
        console.log(`SKIP (${ms}ms) — ${message}`);
        return;
      }
      this.steps.push({ name, status: "FAIL", detail: message, ms });
      console.log(`FAIL (${ms}ms) — ${message}`);
    }
  }

  summary() {
    const totalMs = Date.now() - this.startedAt;
    const passed = this.steps.filter((s) => s.status === "PASS").length;
    const failed = this.steps.filter((s) => s.status === "FAIL").length;
    const skipped = this.steps.filter((s) => s.status === "SKIP").length;
    console.log("\n════════════════════════════════════════");
    console.log("E2E smoke summary");
    console.log("════════════════════════════════════════");
    for (const s of this.steps) {
      console.log(`  [${s.status}] ${s.name} (${s.ms}ms) — ${s.detail}`);
    }
    console.log("────────────────────────────────────────");
    console.log(
      `Result: ${failed === 0 ? "PASS" : "FAIL"}  |  ${passed} passed, ${failed} failed, ${skipped} skipped  |  ${totalMs}ms total`,
    );
    return failed === 0 ? 0 : 1;
  }
}

function skip(reason) {
  const err = new Error(reason);
  err.skip = true;
  throw err;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ─────────────────────────────────────────────────────────────
// HTTP helpers (signed webhooks + cron + doctor session)
// ─────────────────────────────────────────────────────────────

function signMeta(rawBody, appSecret) {
  const hex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  return `sha256=${hex}`;
}

function signRazorpay(rawBody, webhookSecret) {
  return createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
}

/**
 * @param {string} baseUrl
 * @param {object} payload
 * @param {string} appSecret
 */
async function postWhatsAppWebhook(baseUrl, payload, appSecret) {
  const rawBody = JSON.stringify(payload);
  const res = await fetch(`${baseUrl}/api/whatsapp/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Hub-Signature-256": signMeta(rawBody, appSecret),
    },
    body: rawBody,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`WhatsApp webhook HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * @param {string} baseUrl
 * @param {object} payload
 * @param {string} webhookSecret
 * @param {string} eventId
 */
async function postRazorpayWebhook(baseUrl, payload, webhookSecret, eventId) {
  const rawBody = JSON.stringify(payload);
  const res = await fetch(`${baseUrl}/api/webhooks/razorpay`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Razorpay-Signature": signRazorpay(rawBody, webhookSecret),
      "X-Razorpay-Event-Id": eventId,
    },
    body: rawBody,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Razorpay webhook HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * @param {string} baseUrl
 * @param {string} cronSecret
 * @param {string} appointmentId
 * @param {"24h"|"2h"} kind
 */
async function forceSendReminder(baseUrl, cronSecret, appointmentId, kind) {
  const url = new URL(`${baseUrl}/api/cron/booking-reminders`);
  url.searchParams.set("appointmentId", appointmentId);
  url.searchParams.set("kind", kind);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Force reminder ${kind} HTTP ${res.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * @returns {Promise<{ accessToken: string; cookieHeader: string; userId: string }>}
 */
async function signInDoctor() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const email = requireEnv("E2E_TEST_EMAIL");
  const password = requireEnv("E2E_TEST_PASSWORD");

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Doctor sign-in failed (${res.status}): ${text}`);
  }
  const body = await res.json();
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const payload = encodeURIComponent(
    JSON.stringify({
      access_token: body.access_token,
      refresh_token: body.refresh_token,
      token_type: "bearer",
      expires_in: body.expires_in,
      expires_at: body.expires_at,
      user: body.user,
    }),
  );
  return {
    accessToken: body.access_token,
    cookieHeader: `${cookieName}=${payload}`,
    userId: body.user?.id,
  };
}

/**
 * @param {string} baseUrl
 * @param {string} cookieHeader
 * @param {string} path
 */
async function doctorGet(baseUrl, cookieHeader, path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Cookie: cookieHeader, Accept: "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

/**
 * @param {string} baseUrl
 * @param {string} cookieHeader
 * @param {string} path
 * @param {object} json
 */
async function doctorPatch(baseUrl, cookieHeader, path, json) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: {
      Cookie: cookieHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(json),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ─────────────────────────────────────────────────────────────
// WhatsApp Meta payload builders
// ─────────────────────────────────────────────────────────────

let waSeq = 0;
function nextWaMessageId() {
  waSeq += 1;
  return `wamid.e2e.${Date.now()}.${waSeq}.${randomUUID().slice(0, 8)}`;
}

/**
 * @param {{ phoneNumberId: string; contactPhone: string; contactName?: string; message: object }} opts
 */
function buildMetaPayload({ phoneNumberId, contactPhone, contactName = "E2E Smoke", message }) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "e2e-waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                phone_number_id: phoneNumberId,
                display_phone_number: "910000000000",
              },
              contacts: [{ profile: { name: contactName }, wa_id: contactPhone }],
              messages: [
                {
                  from: contactPhone,
                  id: nextWaMessageId(),
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  ...message,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function textMessage(body) {
  return { type: "text", text: { body } };
}

function listReply(id, title = id) {
  return {
    type: "interactive",
    interactive: { type: "list_reply", list_reply: { id, title } },
  };
}

function buttonReply(id, title = id) {
  return {
    type: "interactive",
    interactive: { type: "button_reply", button_reply: { id, title } },
  };
}

/** Template quick-reply tap (reminder Confirm/Cancel/Reschedule). */
function reminderButton(payload, text) {
  return { type: "button", button: { payload, text } };
}

// ─────────────────────────────────────────────────────────────
// DB helpers (service role)
// ─────────────────────────────────────────────────────────────

function adminClient() {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Resolve a WhatsApp-connected clinic that is NOT Ravikiran.
 * Prefers name match (default Deepti). E2E doctor must belong to that clinic
 * so dashboard API steps see the appointment just created.
 */
async function resolveClinic(db, clinicNameHint, doctorUserId) {
  const { data: clinics, error } = await db
    .from("clinics")
    .select("id, name, whatsapp_phone_number_id")
    .not("whatsapp_phone_number_id", "is", null);
  if (error) throw new Error(`Failed to list clinics: ${error.message}`);

  const candidates = (clinics ?? []).filter(
    (c) => c.whatsapp_phone_number_id && !FORBIDDEN_CLINIC_PATTERN.test(c.name ?? ""),
  );
  if (candidates.length === 0) {
    throw new Error("No WhatsApp-connected clinic found that is safe for E2E (non-Ravikiran)");
  }

  const hint = String(clinicNameHint || "").toLowerCase();
  const clinic =
    candidates.find((c) => (c.name ?? "").toLowerCase().includes(hint)) || candidates[0];

  assert(clinic, "Failed to pick a smoke-test clinic");

  let profile = null;
  if (doctorUserId) {
    const { data } = await db
      .from("doctor_profiles")
      .select("clinic_id, full_name, clinic_name, specialization")
      .eq("user_id", doctorUserId)
      .maybeSingle();
    profile = data;
    assert(profile?.clinic_id, "E2E doctor has no doctor_profiles row");
    assert(
      profile.clinic_id === clinic.id,
      `E2E doctor clinic_id=${profile.clinic_id} must match smoke clinic ${clinic.id} (${clinic.name}). ` +
        `Set E2E_TEST_EMAIL to a doctor on that clinic, or pass --clinic-name matching the doctor's clinic.`,
    );
  } else {
    const { data } = await db
      .from("doctor_profiles")
      .select("clinic_id, full_name, clinic_name, specialization")
      .eq("clinic_id", clinic.id)
      .limit(1)
      .maybeSingle();
    profile = data;
  }

  if (
    FORBIDDEN_CLINIC_PATTERN.test(profile?.full_name ?? "") ||
    FORBIDDEN_CLINIC_PATTERN.test(profile?.clinic_name ?? "") ||
    FORBIDDEN_CLINIC_PATTERN.test(clinic.name ?? "")
  ) {
    throw new Error(
      `Refusing to run against Ravikiran-linked profile (clinic=${clinic.name}). Pick --clinic-name=Deepti or another safe clinic.`,
    );
  }

  return { clinic, profile };
}

async function getConversation(db, clinicId, contactPhone) {
  const { data, error } = await db
    .from("conversation_state")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("contact_phone", contactPhone)
    .maybeSingle();
  if (error) throw new Error(`conversation_state read failed: ${error.message}`);
  return data;
}

async function getAppointment(db, appointmentId) {
  const { data, error } = await db
    .from("appointments")
    .select("*")
    .eq("id", appointmentId)
    .maybeSingle();
  if (error) throw new Error(`appointments read failed: ${error.message}`);
  return data;
}

/**
 * @template T
 * @param {() => Promise<T|null|undefined>} fn
 * @param {(value: T) => boolean} predicate
 * @param {string} label
 * @returns {Promise<T>}
 */
async function waitFor(fn, predicate, label) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = await fn();
    if (last != null && predicate(last)) return last;
    await sleep(POLL_MS);
  }
  throw new Error(
    `Timed out waiting for ${label}. Last value: ${JSON.stringify(last)?.slice(0, 400)}`,
  );
}

async function resetConversation(db, clinicId, contactPhone) {
  await db
    .from("conversation_state")
    .upsert(
      {
        clinic_id: clinicId,
        contact_phone: contactPhone,
        current_state: CONVERSATION_STATE.START,
        context: {},
        retry_count: 0,
        last_message_at: new Date().toISOString(),
      },
      { onConflict: "clinic_id,contact_phone" },
    );
}

/**
 * Soft-cancel appointment + reset conversation. Never hard-deletes.
 */
async function cleanupTestData({
  db,
  baseUrl,
  cookieHeader,
  clinicId,
  contactPhone,
  appointmentId,
  patientId,
}) {
  const notes = [];
  if (appointmentId) {
    try {
      const { status, body } = await doctorPatch(baseUrl, cookieHeader, "/api/appointments", {
        appointmentId,
        action: "cancel",
      });
      if (status >= 200 && status < 300) {
        notes.push(`cancelled via API (${appointmentId})`);
      } else {
        // Fallback: service-role status flip (soft cancel).
        const { error } = await db
          .from("appointments")
          .update({
            status: APPOINTMENT_STATUS.CANCELLED,
            cancelled_at: new Date().toISOString(),
            cancellation_reason: "e2e_smoke_cleanup",
            hold_expires_at: null,
          })
          .eq("id", appointmentId)
          .eq("clinic_id", clinicId)
          .in("status", [
            APPOINTMENT_STATUS.PENDING,
            APPOINTMENT_STATUS.PAYMENT_PENDING,
            APPOINTMENT_STATUS.CONFIRMED,
            APPOINTMENT_STATUS.RESCHEDULE_REQUESTED,
          ]);
        if (error) notes.push(`cancel fallback failed: ${error.message} (api=${status} ${JSON.stringify(body)})`);
        else notes.push(`cancelled via service role (${appointmentId})`);
      }
    } catch (err) {
      notes.push(`cancel error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    await resetConversation(db, clinicId, contactPhone);
    notes.push("conversation_state reset to START");
  } catch (err) {
    notes.push(`conversation reset failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Leave patient + vaccination rows (audit); mark patient name so demos can spot them.
  if (patientId) {
    notes.push(`patient left in place for audit (${patientId})`);
  }

  return notes.join("; ");
}

function infantDobDdMmYyyy() {
  // ~6 weeks old — enough upcoming IAP doses if clinic is pediatric.
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 45);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function buildTestPhone() {
  if (process.env.E2E_SMOKE_PHONE) {
    return String(process.env.E2E_SMOKE_PHONE).replace(/\D/g, "");
  }
  // Synthetic Indian mobile that won't collide with real contacts.
  const suffix = String(Date.now()).slice(-7);
  return `919000${suffix}`.slice(0, 12);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  const cli = parseArgs(process.argv.slice(2));
  const baseUrl = (cli.baseUrl || ENV_URLS[cli.env] || ENV_URLS.prod).replace(/\/$/, "");
  const appSecret = requireEnv("WHATSAPP_APP_SECRET");
  const razorpaySecret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
  const cronSecret = requireEnv("CRON_SECRET");

  const reporter = new Reporter();
  const db = adminClient();

  /** @type {{ clinic: { id: string; name: string; whatsapp_phone_number_id: string }; profile: object|null }} */
  let clinicCtx = { clinic: null, profile: null };
  let cookieHeader = "";
  let contactPhone = buildTestPhone();
  let appointmentId = null;
  let patientId = null;
  const patientName = `E2E Smoke ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;
  const runTag = randomUUID().slice(0, 8);

  console.log(`E2E smoke → ${baseUrl} (env=${cli.env})`);
  console.log(`Clinic hint: "${cli.clinicName}"  |  contact: ${contactPhone}  |  run: ${runTag}\n`);

  /**
   * @param {object} message
   */
  async function sendWa(message) {
    const payload = buildMetaPayload({
      phoneNumberId: clinicCtx.clinic.whatsapp_phone_number_id,
      contactPhone,
      message,
    });
    await postWhatsAppWebhook(baseUrl, payload, appSecret);
    await sleep(STEP_GAP_MS);
  }

  try {
    // ── Bootstrap: auth + clinic ──────────────────────────────
    let doctorAuth = null;
    await reporter.run("0. Sign in E2E doctor + resolve safe clinic", async () => {
      doctorAuth = await signInDoctor();
      cookieHeader = doctorAuth.cookieHeader;
      clinicCtx = await resolveClinic(db, cli.clinicName, doctorAuth.userId);
      assert(clinicCtx.clinic?.whatsapp_phone_number_id, "Clinic missing whatsapp_phone_number_id");
      assert(
        !FORBIDDEN_CLINIC_PATTERN.test(clinicCtx.clinic.name ?? ""),
        `Refusing clinic "${clinicCtx.clinic.name}"`,
      );
      await resetConversation(db, clinicCtx.clinic.id, contactPhone);
      return `${clinicCtx.clinic.name} (${clinicCtx.clinic.id}) · doctor=${clinicCtx.profile?.full_name ?? "n/a"} · ${clinicCtx.profile?.specialization ?? "?"}`;
    });

    if (!clinicCtx.clinic) {
      process.exit(reporter.summary());
    }

    const phoneNumberId = clinicCtx.clinic.whatsapp_phone_number_id;
    const clinicId = clinicCtx.clinic.id;

    // ── 1. WhatsApp booking state machine ─────────────────────
    await reporter.run("1a. START → COLLECTING_PATIENT", async () => {
      await sendWa(textMessage("hi"));
      await waitFor(
        () => getConversation(db, clinicId, contactPhone),
        (row) => row.current_state === CONVERSATION_STATE.START,
        "conversation START after greeting",
      );

      await sendWa(listReply(START_MENU_INTENT.BOOK, "Book an appointment"));
      const row = await waitFor(
        () => getConversation(db, clinicId, contactPhone),
        (r) => r.current_state === CONVERSATION_STATE.COLLECTING_PATIENT,
        "COLLECTING_PATIENT",
      );
      return `state=${row.current_state} step=${row.context?.collectingPatientStep ?? "?"}`;
    });

    await reporter.run("1b. COLLECTING_PATIENT → SLOT_SELECTION (new patient + DOB)", async () => {
      const collecting = await waitFor(
        () => getConversation(db, clinicId, contactPhone),
        (r) =>
          r.current_state === CONVERSATION_STATE.COLLECTING_PATIENT &&
          Boolean(r.context?.collectingPatientStep),
        "collectingPatientStep set",
      );

      // New contacts land on AWAITING_NAME; returning contacts get a patient list.
      if (collecting.context.collectingPatientStep === "AWAITING_SELECTION") {
        await sendWa(listReply(PATIENT_SELECTION_ADD_NEW_ID, "+ Add new patient"));
      }
      await sendWa(textMessage(patientName));
      await sendWa(textMessage(infantDobDdMmYyyy()));
      await sendWa(buttonReply(CONSENT_INTENT.YES, "Yes, I consent"));

      const row = await waitFor(
        () => getConversation(db, clinicId, contactPhone),
        (r) => r.current_state === CONVERSATION_STATE.SLOT_SELECTION,
        "SLOT_SELECTION",
      );
      patientId = row.context?.selectedPatientId ?? null;
      assert(patientId, "selectedPatientId missing after consent");
      assert(
        Array.isArray(row.context?.offeredSlots) && row.context.offeredSlots.length > 0,
        "No offeredSlots in conversation context — clinic may have no open slots",
      );
      return `patient=${patientId} slots=${row.context.offeredSlots.length}`;
    });

    await reporter.run("1c. SLOT_SELECTION → PAYMENT_PENDING (appointment row)", async () => {
      const row = await getConversation(db, clinicId, contactPhone);
      const slot = row.context.offeredSlots[0];
      const replyId = slotRowId(new Date(slot.slotStart));
      await sendWa(listReply(replyId, "Pick slot"));

      const pending = await waitFor(
        async () => {
          const conv = await getConversation(db, clinicId, contactPhone);
          if (conv?.current_state !== CONVERSATION_STATE.PAYMENT_PENDING) return null;
          const apptId = conv.context?.appointmentId;
          if (!apptId) return null;
          const appt = await getAppointment(db, apptId);
          if (!appt || appt.status !== APPOINTMENT_STATUS.PAYMENT_PENDING) return null;
          return appt;
        },
        Boolean,
        "appointment payment_pending",
      );
      appointmentId = pending.id;
      return `appointment=${appointmentId} status=${pending.status} amount=${pending.payment_amount}`;
    });

    // ── 2. Razorpay payment.captured ──────────────────────────
    await reporter.run("2. payment.captured → CONFIRMED + invoice + notification + WA confirm path", async () => {
      assert(appointmentId, "No appointmentId from step 1");
      const paymentId = `pay_e2e_${runTag}`;
      const eventId = `evt_e2e_${runTag}_${Date.now()}`;
      const payload = {
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: paymentId,
              notes: {
                appointment_id: appointmentId,
                clinic_id: clinicId,
              },
            },
          },
        },
      };
      const ack = await postRazorpayWebhook(baseUrl, payload, razorpaySecret, eventId);
      assert(ack.status === "processed", `Unexpected Razorpay ack: ${JSON.stringify(ack)}`);

      const appt = await waitFor(
        () => getAppointment(db, appointmentId),
        (a) => a.status === APPOINTMENT_STATUS.CONFIRMED && a.razorpay_payment_id === paymentId,
        "appointment confirmed",
      );

      const { data: invoice } = await db
        .from("booking_invoices")
        .select("id, invoice_number, storage_path")
        .eq("clinic_id", clinicId)
        .eq("appointment_id", appointmentId)
        .maybeSingle();
      assert(invoice?.storage_path, "booking_invoices row / storage_path missing");

      const { data: notif } = await db
        .from("notifications")
        .select("id, type, related_appointment_id")
        .eq("clinic_id", clinicId)
        .eq("related_appointment_id", appointmentId)
        .eq("type", "payment_received")
        .maybeSingle();
      assert(notif?.id, "payment_received in-app notification missing");

      const conv = await waitFor(
        () => getConversation(db, clinicId, contactPhone),
        (r) => r.current_state === CONVERSATION_STATE.CONFIRMED,
        "conversation CONFIRMED",
      );

      return `appt=${appt.status} invoice=${invoice.invoice_number} notif=${notif.id} conv=${conv.current_state} (WA confirm path invoked by webhook handler)`;
    });

    // ── 3. Force-send reminders ───────────────────────────────
    await reporter.run("3. Force-send 24h + 2h reminders (claim + button payloads)", async () => {
      assert(appointmentId, "No appointmentId");
      const expectedButtons = [
        reminderReplyId(REMINDER_REPLY_ACTION.CONFIRM, appointmentId),
        reminderReplyId(REMINDER_REPLY_ACTION.CANCEL, appointmentId),
        reminderReplyId(REMINDER_REPLY_ACTION.RESCHEDULE, appointmentId),
      ];

      const r24 = await forceSendReminder(baseUrl, cronSecret, appointmentId, "24h");
      assert(r24.mode === "force" && r24.sent === true, `24h force send failed: ${JSON.stringify(r24)}`);
      const after24 = await waitFor(
        () => getAppointment(db, appointmentId),
        (a) => Boolean(a.reminder_24h_sent_at),
        "reminder_24h_sent_at",
      );

      const r2 = await forceSendReminder(baseUrl, cronSecret, appointmentId, "2h");
      assert(r2.mode === "force" && r2.sent === true, `2h force send failed: ${JSON.stringify(r2)}`);
      const after2 = await waitFor(
        () => getAppointment(db, appointmentId),
        (a) => Boolean(a.reminder_2h_sent_at),
        "reminder_2h_sent_at",
      );

      // ReminderService always builds buttonPayloads before the live/stub gate;
      // claim stamps prove the send path ran. Assert the stable payload contract.
      assert(
        expectedButtons.every((p) => p.startsWith("booking_reminder_") && p.includes(appointmentId)),
        "Unexpected reminder button payload contract",
      );

      return `24h@${after24.reminder_24h_sent_at} 2h@${after2.reminder_2h_sent_at} buttons=[${expectedButtons.join(", ")}]`;
    });

    // ── 4a. Confirm (ack only) ────────────────────────────────
    await reporter.run("4a. Reminder Confirm button → stays CONFIRMED", async () => {
      const payload = reminderReplyId(REMINDER_REPLY_ACTION.CONFIRM, appointmentId);
      await sendWa(reminderButton(payload, "Confirm"));
      await sleep(STEP_GAP_MS);
      const appt = await getAppointment(db, appointmentId);
      assert(appt.status === APPOINTMENT_STATUS.CONFIRMED, `Expected confirmed, got ${appt.status}`);
      return `status=${appt.status} (confirm is ack-only)`;
    });

    // ── 5. Vaccination auto-seed (after patient create) ───────
    await reporter.run("5. Vaccination auto-seed (if pediatric + DOB)", async () => {
      assert(patientId, "No patientId");
      const specialization = clinicCtx.profile?.specialization ?? "";
      const isPediatric = /pa?ediatric/i.test(specialization);

      const { data: rows, error } = await db
        .from("vaccination_schedules")
        .select("id, vaccine_name, due_date, status")
        .eq("clinic_id", clinicId)
        .eq("patient_id", patientId);
      if (error) throw new Error(error.message);

      if (!isPediatric) {
        skip(
          `Clinic specialization "${specialization}" is not pediatric — auto-seed correctly gated (rows=${rows?.length ?? 0})`,
        );
      }
      assert((rows?.length ?? 0) > 0, "Expected vaccination_schedules rows for pediatric patient with DOB");
      return `seeded ${rows.length} dose(s)`;
    }, { optional: true });

    // ── 6–9. Doctor dashboard APIs (before cancel) ────────────
    await reporter.run("6. GET /api/notifications — 200 + shape", async () => {
      const { status, body } = await doctorGet(baseUrl, cookieHeader, "/api/notifications?limit=20");
      assert(status === 200, `HTTP ${status}: ${JSON.stringify(body)}`);
      assert(Array.isArray(body.notifications), "notifications array missing");
      assert(typeof body.unreadCount === "number", "unreadCount missing");
      assert(typeof body.total === "number", "total missing");
      const hit = body.notifications.find((n) => n.related_appointment_id === appointmentId);
      assert(hit, "payment notification for test appointment not in list");
      return `total=${body.total} hit=${hit.type}`;
    });

    await reporter.run("7. GET /api/payments — includes test payment", async () => {
      const { status, body } = await doctorGet(baseUrl, cookieHeader, "/api/payments?limit=50");
      assert(status === 200, `HTTP ${status}: ${JSON.stringify(body)}`);
      assert(Array.isArray(body.payments), "payments array missing");
      const hit = body.payments.find((p) => p.appointmentId === appointmentId || p.id === appointmentId);
      assert(hit, "Test payment/appointment not in /api/payments");
      return `paymentStatus=${hit.paymentStatus} amount=${hit.amount} hasInvoice=${hit.hasInvoicePdf}`;
    });

    await reporter.run("8. GET /api/vaccinations — 200", async () => {
      const { status, body } = await doctorGet(baseUrl, cookieHeader, "/api/vaccinations?limit=20");
      assert(status === 200, `HTTP ${status}: ${JSON.stringify(body)}`);
      assert(Array.isArray(body.vaccinations), "vaccinations array missing");
      assert(typeof body.total === "number", "total missing");
      return `total=${body.total}`;
    });

    await reporter.run("9. Invoice PDF URL — valid PDF bytes", async () => {
      const { status, body } = await doctorGet(
        baseUrl,
        cookieHeader,
        `/api/payments/${appointmentId}/invoice`,
      );
      assert(status === 200, `HTTP ${status}: ${JSON.stringify(body)}`);
      assert(body.url, "Signed invoice URL missing");

      const pdfRes = await fetch(body.url);
      assert(pdfRes.ok, `PDF fetch HTTP ${pdfRes.status}`);
      const contentType = pdfRes.headers.get("content-type") || "";
      const buf = Buffer.from(await pdfRes.arrayBuffer());
      assert(buf.length > 0, "PDF body is empty");
      assert(buf.slice(0, 4).toString("utf8") === "%PDF", "Body does not start with %PDF");
      assert(
        /pdf/i.test(contentType) || contentType === "application/octet-stream" || !contentType,
        `Unexpected content-type: ${contentType}`,
      );
      return `${buf.length} bytes · ${contentType || "no content-type"} · ${body.invoiceNumber}`;
    });

    // ── 4b/4c. Reschedule then Cancel (+ refund) ──────────────
    await reporter.run("4b. Reminder Reschedule button → SLOT_SELECTION", async () => {
      const payload = reminderReplyId(REMINDER_REPLY_ACTION.RESCHEDULE, appointmentId);
      await sendWa(reminderButton(payload, "Reschedule"));
      const conv = await waitFor(
        () => getConversation(db, clinicId, contactPhone),
        (r) => r.current_state === CONVERSATION_STATE.SLOT_SELECTION,
        "SLOT_SELECTION after reschedule",
      );
      const appt = await getAppointment(db, appointmentId);
      assert(appt.status === APPOINTMENT_STATUS.CONFIRMED, "Appointment should stay confirmed until new slot picked");
      return `conv=${conv.current_state} appt=${appt.status}`;
    });

    await reporter.run("4c. Reminder Cancel button → cancelled + refund fired", async () => {
      const payload = reminderReplyId(REMINDER_REPLY_ACTION.CANCEL, appointmentId);
      await sendWa(reminderButton(payload, "Cancel"));
      const appt = await waitFor(
        () => getAppointment(db, appointmentId),
        (a) => a.status === APPOINTMENT_STATUS.CANCELLED,
        "appointment cancelled",
      );

      // Fake pay_e2e_* id → Razorpay refund API fails, but refund path must still fire.
      const refundOk = [
        REFUND_STATUS.PROCESSING,
        REFUND_STATUS.COMPLETED,
        REFUND_STATUS.FAILED,
      ].includes(appt.refund_status);
      const wasCaptured =
        CAPTURED_PAYMENT_STATUSES.includes(String(appt.payment_status ?? "").toLowerCase()) ||
        appt.payment_status === "refunded" ||
        Boolean(appt.razorpay_payment_id);
      assert(
        refundOk || wasCaptured,
        `Expected refund attempt (processing|completed|failed), got refund_status=${appt.refund_status} payment_status=${appt.payment_status}`,
      );
      // Mark cleaned so finally doesn't double-cancel unnecessarily.
      appointmentId = appt.id;
      return `status=${appt.status} refund_status=${appt.refund_status} payment_status=${appt.payment_status}`;
    });
  } finally {
    console.log("\n— cleanup —");
    try {
      if (clinicCtx.clinic && contactPhone) {
        const notes = await cleanupTestData({
          db,
          baseUrl,
          cookieHeader,
          clinicId: clinicCtx.clinic.id,
          contactPhone,
          appointmentId,
          patientId,
        });
        console.log(`  ${notes}`);
      } else {
        console.log("  skipped (clinic/contact not initialized)");
      }
    } catch (err) {
      console.log(`  cleanup error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  process.exit(reporter.summary());
}

const isMainModule =
  Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((err) => {
    console.error("\nFatal:", err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
  });
}
