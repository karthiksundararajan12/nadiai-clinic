-- One measured vitals row for the current scribe visit. The Say vitals
-- row upserts this on blur. Out-of-range values are stored; the UI flags them.

CREATE TABLE IF NOT EXISTS public.visit_vitals (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id      uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id  uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  session_id      uuid        REFERENCES public.scribe_sessions(id) ON DELETE SET NULL,
  bp_systolic     integer,
  bp_diastolic    integer,
  pulse           integer,
  temp            numeric(5,1),
  temp_unit       text,
  spo2            integer,
  weight_kg       numeric(6,2),
  height_cm       numeric(5,1),
  heard_text      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_vitals_temp_unit_check CHECK (temp_unit IS NULL OR temp_unit IN ('F', 'C'))
);

COMMENT ON TABLE public.visit_vitals IS
  'Vitals captured on the scribe Record step for this visit. Updated on blur.';

CREATE UNIQUE INDEX IF NOT EXISTS visit_vitals_session_key
  ON public.visit_vitals (session_id)
  WHERE session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS visit_vitals_appointment_key
  ON public.visit_vitals (clinic_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS visit_vitals_patient_updated
  ON public.visit_vitals (clinic_id, patient_id, updated_at DESC);

ALTER TABLE public.visit_vitals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.visit_vitals TO authenticated;
GRANT ALL ON public.visit_vitals TO service_role;

DROP POLICY IF EXISTS "Doctors can read their clinic visit vitals" ON public.visit_vitals;
CREATE POLICY "Doctors can read their clinic visit vitals"
  ON public.visit_vitals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = visit_vitals.clinic_id
    )
  );

DROP POLICY IF EXISTS "Doctors can insert their clinic visit vitals" ON public.visit_vitals;
CREATE POLICY "Doctors can insert their clinic visit vitals"
  ON public.visit_vitals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = visit_vitals.clinic_id
    )
  );

DROP POLICY IF EXISTS "Doctors can update their clinic visit vitals" ON public.visit_vitals;
CREATE POLICY "Doctors can update their clinic visit vitals"
  ON public.visit_vitals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = visit_vitals.clinic_id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = visit_vitals.clinic_id
    )
  );
