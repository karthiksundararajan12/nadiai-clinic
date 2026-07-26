-- public.patients is clinic-scoped (clinic_id + full_name) but had RLS
-- enabled with zero policies, so authenticated/anon clients always saw
-- zero rows. Mirror the clinic membership pattern used by notifications
-- and scribe_audit_logs.

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read their clinic patients" ON public.patients;
CREATE POLICY "Doctors can read their clinic patients"
  ON public.patients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = patients.clinic_id
    )
  );
