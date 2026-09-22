-- Idempotency ledger for inbound WhatsApp webhook deliveries.
--
-- Meta redelivers an inbound message webhook whenever it doesn't get a
-- prompt 2xx, and occasionally redelivers regardless. Until now the only
-- dedupe was `conversation_state.context.last_wa_message_id`, which holds a
-- single wamid: once any other message is processed for the same contact,
-- the previous wamid is forgotten and a late redelivery of it is treated as
-- brand new. Replaying an inbound message re-runs its side effects --
-- re-sending the CONFIRMED fallback reply, or re-running a reset keyword and
-- wiping conversation_state back to START.
--
-- Every delivery's `messages[].id` (wamid) is recorded here exactly once
-- (UNIQUE on wa_message_id) *before* its effects are applied; a unique
-- violation on insert means "already processed" and the caller no-ops.
-- Same claim-before-side-effect pattern as razorpay_webhook_events
-- (migration 020) and AppointmentRepository.claimReminder.
--
-- Retention: rows are only useful for as long as Meta may still retry a
-- delivery (hours, not weeks). Safe to prune anything older than ~7 days --
-- received_at is indexed for exactly that.
--
-- See features/booking/repository/whatsapp-inbound-message.repository.js
-- and app/api/whatsapp/webhook/route.js.

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_message_id   text NOT NULL,
  phone_number_id text NULL,
  contact_phone   text NULL,
  clinic_id       uuid NULL REFERENCES public.clinics(id) ON DELETE SET NULL,
  received_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_inbound_messages_wa_message_id_key UNIQUE (wa_message_id)
);

CREATE INDEX IF NOT EXISTS whatsapp_inbound_messages_received_at_idx
  ON public.whatsapp_inbound_messages (received_at);

COMMENT ON TABLE public.whatsapp_inbound_messages IS
  'Idempotency ledger for inbound WhatsApp webhook deliveries, keyed on Meta''s wamid (messages[].id). Insert-if-new is the dedupe mechanism -- see the /api/whatsapp/webhook route. Prunable after ~7 days.';

-- Service-role only (the webhook has no user session, same as every other
-- booking table -- see ARCHITECTURE.md and features/booking/index.js header
-- note #3 on deferred RLS).
ALTER TABLE public.whatsapp_inbound_messages ENABLE ROW LEVEL SECURITY;
