-- Idempotency ledger for Razorpay webhook deliveries (PaymentWebhookService).
--
-- Razorpay redelivers a webhook whenever it doesn't get a prompt 2xx, and
-- can occasionally redeliver regardless -- the payment/order id alone isn't
-- enough to dedupe on, since a single payment can legitimately produce more
-- than one *event* (e.g. authorized, then captured). Every delivery's
-- `X-Razorpay-Event-Id` header is recorded here exactly once (UNIQUE on
-- event_id) before its effects (confirming/releasing an appointment) are
-- applied; a unique-violation on insert means "already processed" and the
-- caller no-ops instead of re-running the transition.
--
-- See features/booking/repository/razorpay-webhook-event.repository.js and
-- features/booking/services/payment-webhook.service.js.

CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    text NOT NULL,
  event_type  text NOT NULL,
  payload     jsonb NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT razorpay_webhook_events_event_id_key UNIQUE (event_id)
);

COMMENT ON TABLE public.razorpay_webhook_events IS
  'Idempotency ledger for Razorpay webhook deliveries, keyed on the X-Razorpay-Event-Id header. Insert-if-new is the dedupe mechanism -- see PaymentWebhookService.';

-- Service-role only (booking bot webhook handlers use the service-role
-- client, same as every other booking table -- see ARCHITECTURE.md and
-- features/booking/index.js header note #3 on deferred RLS).
ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
