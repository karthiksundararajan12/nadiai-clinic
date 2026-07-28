-- Vaccination reminder schedules — manually entered by clinic staff
-- (dashboard POST /api/vaccinations; see features/vaccinations/) and swept
-- daily by the vaccination-reminders cron
-- (features/vaccinations/vaccination-reminder.service.js) to send a
-- WhatsApp reminder ~3 days before due_date and flag overdue records.
--
-- NOTE: this file is numbered 030, not 029 as originally requested — 029
-- was already taken by 029_patients_clinic_rls.sql by the time this was
-- written. Flagged here rather than silently renumbering an existing file.
--
-- Automatic seeding of rows from a standard immunization schedule is
-- explicitly out of scope for this migration/build (pending doctor input)
-- — this table is manual-entry-only for now.

CREATE TABLE IF NOT EXISTS public.vaccination_schedules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id        uuid NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  vaccine_name      text NOT NULL,
  due_date          date NOT NULL,
  status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'reminder_sent', 'completed', 'overdue')),
  reminder_sent_at  timestamptz NULL,
  completed_at      timestamptz NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaccination_schedules_clinic_due_status
  ON public.vaccination_schedules (clinic_id, due_date, status);

COMMENT ON TABLE public.vaccination_schedules IS
  'Clinic-scoped vaccination due dates, manually entered from the dashboard. Swept daily by the vaccination-reminders cron (WhatsApp template vaccination_reminder, pending Meta approval).';

ALTER TABLE public.vaccination_schedules ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.vaccination_schedules TO authenticated;
GRANT ALL ON public.vaccination_schedules TO service_role;

-- Doctors may read vaccination schedules for clinics they belong to.
DROP POLICY IF EXISTS "Doctors read clinic vaccination schedules" ON public.vaccination_schedules;
CREATE POLICY "Doctors read clinic vaccination schedules"
  ON public.vaccination_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = vaccination_schedules.clinic_id
    )
  );

-- Doctors may add vaccination schedules for clinics they belong to (manual
-- entry form — see POST /api/vaccinations).
DROP POLICY IF EXISTS "Doctors insert clinic vaccination schedules" ON public.vaccination_schedules;
CREATE POLICY "Doctors insert clinic vaccination schedules"
  ON public.vaccination_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = vaccination_schedules.clinic_id
    )
  );

-- UPDATE requires SELECT (Postgres RLS). Doctors may update their clinic's
-- rows (e.g. marking a vaccination completed from the dashboard). The cron
-- sweep itself always runs as service_role and is unaffected by RLS.
DROP POLICY IF EXISTS "Doctors update clinic vaccination schedules" ON public.vaccination_schedules;
CREATE POLICY "Doctors update clinic vaccination schedules"
  ON public.vaccination_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = vaccination_schedules.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = vaccination_schedules.clinic_id
    )
  );
