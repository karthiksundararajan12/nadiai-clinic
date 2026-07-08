-- Session 5 — REMINDER_SENT (scheduled reminders + no-response timeout).
--
-- REMINDER_SENT is deliberately NOT a conversation_state.current_state value
-- (see ARCHITECTURE.md section 4, and features/booking/index.js header note):
-- conversation_state is a singleton per (clinic_id, contact_phone) tracking
-- ONE active pre-appointment flow, but a contact can have multiple confirmed
-- appointments needing independent reminders. Reminder progress is tracked
-- directly on the appointment row instead.
--
-- reminder_24h_sent_at / reminder_2h_sent_at (nullable): stamped by the
-- reminder cron (features/booking/services/reminder.service.js) the moment
-- it *claims* an appointment for that reminder — a single conditional
-- UPDATE ... WHERE reminder_Xh_sent_at IS NULL, mirroring the
-- confirmPayment/releaseFailedHold atomic-claim pattern in
-- appointment.repository.js. NULL means "not sent yet"; this is also the
-- query-level filter that keeps the cron from re-sending on every run.
--
-- reminder_24h_offset_minutes / reminder_2h_offset_minutes on clinics
-- (default 1440 / 120): how long before slot_start each reminder should
-- fire, configurable per clinic per the Session 5 spec.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS reminder_24h_offset_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS reminder_2h_offset_minutes  integer NOT NULL DEFAULT 120;

COMMENT ON COLUMN public.clinics.reminder_24h_offset_minutes IS
  'Minutes before appointments.slot_start the T-24h reminder should fire. Default 1440 (24h).';
COMMENT ON COLUMN public.clinics.reminder_2h_offset_minutes IS
  'Minutes before appointments.slot_start the T-2h reminder should fire. Default 120 (2h).';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_24h_sent_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS reminder_2h_sent_at  timestamptz NULL;

COMMENT ON COLUMN public.appointments.reminder_24h_sent_at IS
  'Set (claimed) by the reminder cron when the T-24h reminder is sent. NULL = not sent yet; also the idempotency guard against double-sending.';
COMMENT ON COLUMN public.appointments.reminder_2h_sent_at IS
  'Set (claimed) by the reminder cron when the T-2h reminder is sent. NULL = not sent yet; also the idempotency guard against double-sending.';
