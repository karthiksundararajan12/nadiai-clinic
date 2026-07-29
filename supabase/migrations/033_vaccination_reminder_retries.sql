-- Vaccination reminder claim/retry fix (see
-- features/vaccinations/vaccination-reminder.service.js and
-- vaccination.repository.js -- recordReminderFailure).
--
-- Bug: claimReminderSent flips a schedule to `reminder_sent` BEFORE the
-- WhatsApp send is confirmed. Before this migration, a failed send was
-- unconditionally rolled back to `pending` (revertToPending) with no
-- bound on retries -- fine for a transient failure, but a permanent one
-- (e.g. Meta error 132001, "template not found") would retry forever on
-- every cron sweep, alerting every single time and never giving up.
--
-- Fix: track how many times a claimed send has failed
-- (reminder_attempts), and once it hits MAX_VACCINATION_REMINDER_ATTEMPTS
-- (see constants.js), stop retrying -- move the row to a new terminal
-- `reminder_failed` status instead of endlessly cycling back to `pending`.
-- `reminder_failed` rows are never selected by findDueForReminder (which
-- only queries `pending`), so they stop consuming cron cycles, and are
-- surfaced on the /vaccinations dashboard for manual follow-up.

ALTER TABLE public.vaccination_schedules
  ADD COLUMN IF NOT EXISTS reminder_attempts integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.vaccination_schedules.reminder_attempts IS
  'Count of failed WhatsApp send attempts after being claimed (reminder_sent) -- see VaccinationRepository.recordReminderFailure. Reset to 0 whenever the schedule is manually reset back to pending (see scripts/reset-vaccination-reminder-claim.mjs).';

ALTER TABLE public.vaccination_schedules
  DROP CONSTRAINT IF EXISTS vaccination_schedules_status_check;

ALTER TABLE public.vaccination_schedules
  ADD CONSTRAINT vaccination_schedules_status_check
  CHECK (status IN ('pending', 'reminder_sent', 'completed', 'overdue', 'reminder_failed'));
