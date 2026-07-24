-- Appointment refund tracking for Razorpay full refunds issued when a
-- patient cancels via WhatsApp reminder Cancel (appt_reminder_2h/24h).
-- Written best-effort by ReminderService after cancelViaReminderReply —
-- cancellation always succeeds even if the refund API call fails.
--
-- Also adds optional jsonb payload on notifications so the dashboard can
-- surface structured refund_status on appointment_cancelled rows.

DO $$ BEGIN
  CREATE TYPE public.appointment_refund_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'not_applicable'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS refund_status public.appointment_refund_status NULL,
  ADD COLUMN IF NOT EXISTS refund_id text NULL,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz NULL;

COMMENT ON COLUMN public.appointments.refund_status IS
  'Razorpay refund lifecycle for cancelled paid appointments. not_applicable when no captured payment exists.';
COMMENT ON COLUMN public.appointments.refund_id IS
  'Razorpay refund id (rfnd_…) once create-refund succeeds.';
COMMENT ON COLUMN public.appointments.refunded_at IS
  'When Razorpay accepted the refund (refund_status=completed).';

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_refund_status
  ON public.appointments (clinic_id, refund_status)
  WHERE refund_status IS NOT NULL;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS payload jsonb NULL;

COMMENT ON COLUMN public.notifications.payload IS
  'Optional structured metadata (e.g. { "refund_status": "completed" } on appointment_cancelled).';
