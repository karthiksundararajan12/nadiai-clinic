-- In-app doctor notifications (e.g. payment.captured → payment_received).
-- Written by PaymentWebhookService (service_role); read/mark-read by dashboard
-- API routes after resolveRequestContext, scoped by clinic_id.

DO $$ BEGIN
  CREATE TYPE public.notification_type AS ENUM ('payment_received');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id               uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  doctor_id               uuid NULL REFERENCES public.doctor_profiles(id) ON DELETE SET NULL,
  type                    public.notification_type NOT NULL,
  title                   text NOT NULL,
  message                 text NOT NULL,
  related_appointment_id  uuid NULL REFERENCES public.appointments(id) ON DELETE SET NULL,
  is_read                 boolean NOT NULL DEFAULT false,
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_clinic_created
  ON public.notifications (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_clinic_unread
  ON public.notifications (clinic_id, created_at DESC)
  WHERE is_read = false;

COMMENT ON TABLE public.notifications IS
  'Clinic-scoped in-app notifications for doctors (dashboard bell). Inserted best-effort after payment.captured.';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Doctors may read notifications for clinics they belong to.
DROP POLICY IF EXISTS "Doctors read clinic notifications" ON public.notifications;
CREATE POLICY "Doctors read clinic notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = notifications.clinic_id
    )
  );

-- UPDATE requires SELECT (Postgres RLS). Doctors may mark their clinic's rows read.
DROP POLICY IF EXISTS "Doctors update clinic notifications" ON public.notifications;
CREATE POLICY "Doctors update clinic notifications"
  ON public.notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = notifications.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = notifications.clinic_id
    )
  );
