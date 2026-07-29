-- Ops alerting audit trail (features/booking/lib/alerting.js — alertOps).
--
-- Every best-effort catch block that previously only did `log.error(...)`
-- now also fires alertOps(), which (a) best-effort-sends a message to
-- whichever ops channel is configured (Slack webhook or admin WhatsApp
-- number — see alerting.js header) and (b) inserts a row here regardless
-- of whether that send succeeded. This table is what
-- DailyDigestService (features/booking/services/daily-digest.service.js)
-- queries every morning to report concrete counts ("N vaccination-seed
-- failures yesterday") instead of grepping stdout logs, which aren't
-- queryable.
--
-- Internal diagnostic table only — never surfaced to a doctor/dashboard
-- user, so no doctor-facing RLS policies (same rationale as
-- razorpay_webhook_events in migration 020). Booking bot code paths that
-- insert here already run as service_role.

CREATE TABLE IF NOT EXISTS public.ops_alerts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  step          text NOT NULL,
  title         text NULL,
  clinic_id     uuid NULL REFERENCES public.clinics(id) ON DELETE SET NULL,
  patient_id    uuid NULL REFERENCES public.patients(id) ON DELETE SET NULL,
  contact_phone text NULL,
  error_message text NULL,
  channel       text NOT NULL DEFAULT 'none' CHECK (channel IN ('slack', 'whatsapp', 'none')),
  delivered     boolean NOT NULL DEFAULT false,
  extra         jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_step_created_at
  ON public.ops_alerts (step, created_at);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_created_at
  ON public.ops_alerts (created_at);

COMMENT ON TABLE public.ops_alerts IS
  'Audit trail of every alertOps() call (features/booking/lib/alerting.js) — one row per best-effort failure surfaced to the ops alert channel, queried by the daily digest cron for yesterday''s counts.';

ALTER TABLE public.ops_alerts ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.ops_alerts TO service_role;
