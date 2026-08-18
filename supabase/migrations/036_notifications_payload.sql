-- Ensure notifications.payload exists (added in 028_appointment_refunds).
-- schema.sql historically omitted this column, so DBs rebuilt from schema.sql
-- (e.g. nadiai-dev) can miss it while app code always SELECTs payload
-- (notification.repository.js → 42703 undefined_column).

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS payload jsonb NULL;

COMMENT ON COLUMN public.notifications.payload IS
  'Optional structured metadata (e.g. { "refund_status": "completed" } on appointment_cancelled).';
