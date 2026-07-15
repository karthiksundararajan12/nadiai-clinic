-- Doctor-controlled gate for patient WhatsApp appointment reminders (T-24h / T-2h).
-- Checked by ReminderService.runReminderSweep before querying or sending reminders.

ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS reminders_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.doctor_profiles.reminders_enabled IS
  'When false, the booking reminder cron skips sending T-24h/T-2h WhatsApp reminders for this clinic''s appointments.';
