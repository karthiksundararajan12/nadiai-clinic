-- Dev-only. nadiai-dev was bootstrapped from schema.sql and still has the
-- pre-booking patients columns. nadiai-clinic never had them.
-- doctor_id cannot be dropped while the legacy RLS policy and FK depend on it.
-- The clinic-scoped policy from 029 stays.

DROP POLICY IF EXISTS "Doctors can manage their own patients" ON public.patients;

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_doctor_id_fkey;

ALTER TABLE public.patients
  DROP COLUMN IF EXISTS doctor_id,
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS age,
  DROP COLUMN IF EXISTS phone,
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS condition,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS last_visit,
  DROP COLUMN IF EXISTS next_appointment;
