-- Vitals capture, triggered from the Appointments dashboard ("Record
-- Vitals" row action — see app/(dashboard)/appointments/page.js) and
-- displayed on the patient detail page (app/(dashboard)/patients/[id]).
--
-- appointment_id is nullable: it's auto-set when recorded from an
-- appointment row (the normal flow — see VitalsService.create, which
-- derives patient_id FROM the appointment server-side rather than trusting
-- a client-supplied value), but the schema allows a future direct-entry
-- path (patientId only, no appointment) without a migration.
--
-- All vital fields are nullable — staff may not capture every field every
-- visit (e.g. just a temperature check). Numeric range/type validation
-- lives in VitalsService (parseOptionalNumber), not DB CHECK constraints,
-- matching the app-level validation convention already used for
-- vaccination_schedules/patients (parseVaccineName, parseAgeYears, etc.)
-- rather than DB-level CHECKs.

CREATE TABLE IF NOT EXISTS public.vitals (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id                uuid        NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id            uuid        REFERENCES public.appointments(id) ON DELETE SET NULL,
  recorded_by               uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at               timestamptz NOT NULL DEFAULT now(),
  blood_pressure_systolic   integer,
  blood_pressure_diastolic  integer,
  temperature_celsius       numeric(4,1),
  weight_kg                 numeric(5,2),
  height_cm                 numeric(5,1),
  pulse_bpm                 integer,
  spo2_percent              integer,
  notes                     text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vitals IS
  'Vitals recorded per patient, optionally linked to the appointment they were captured at. See features/vitals/vitals.service.js.';
COMMENT ON COLUMN public.vitals.appointment_id IS
  'Set when recorded via the /appointments "Record Vitals" row action; nullable to allow future direct-entry (no appointment) recording.';

CREATE INDEX IF NOT EXISTS idx_vitals_patient_recorded_at
  ON public.vitals (clinic_id, patient_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_vitals_appointment_id
  ON public.vitals (appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.vitals TO authenticated;
GRANT ALL ON public.vitals TO service_role;

-- Mirrors the doctor-clinic-membership policy pattern used by
-- public.patients (029_patients_clinic_rls.sql) and
-- public.vaccination_schedules.
DROP POLICY IF EXISTS "Doctors can read their clinic vitals" ON public.vitals;
CREATE POLICY "Doctors can read their clinic vitals"
  ON public.vitals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = vitals.clinic_id
    )
  );

DROP POLICY IF EXISTS "Doctors can record vitals for their clinic" ON public.vitals;
CREATE POLICY "Doctors can record vitals for their clinic"
  ON public.vitals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
        AND dp.clinic_id = vitals.clinic_id
    )
  );
