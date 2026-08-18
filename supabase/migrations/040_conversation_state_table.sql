-- public.conversation_state — WhatsApp booking bot flow state.
-- Documented in ARCHITECTURE.md and used by ConversationStateRepository, but
-- never committed as a migration (same missing 014–017 foundation gap).
-- Scoped by UNIQUE (clinic_id, contact_phone); context jsonb holds in-progress
-- selections and last processed wa_message_id (idempotency ledger).

CREATE TABLE IF NOT EXISTS public.conversation_state (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contact_phone   text NOT NULL,
  current_state   text NOT NULL,
  context         jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_count     integer NOT NULL DEFAULT 0,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_state_clinic_contact_key UNIQUE (clinic_id, contact_phone)
);

COMMENT ON TABLE public.conversation_state IS
  'One active pre-appointment WhatsApp booking flow per (clinic_id, contact_phone).';
COMMENT ON COLUMN public.conversation_state.context IS
  'In-progress selections (patient_id, slot, etc.) and last processed wa_message_id.';
COMMENT ON COLUMN public.conversation_state.retry_count IS
  'Failed-parse / invalid-reply counter; drives HUMAN_HANDOFF fallback.';
COMMENT ON COLUMN public.conversation_state.last_message_at IS
  'Updated on each inbound message; drives 24h inactivity expiry.';

CREATE INDEX IF NOT EXISTS idx_conversation_state_clinic_last_message
  ON public.conversation_state (clinic_id, last_message_at DESC);

ALTER TABLE public.conversation_state ENABLE ROW LEVEL SECURITY;

-- Service-role / booking webhook uses the service client; doctors do not
-- need direct table access. Keep RLS on with no authenticated policies
-- (deny-by-default for anon/authenticated).
GRANT ALL ON public.conversation_state TO service_role;
