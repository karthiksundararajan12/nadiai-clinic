-- Booking-hub columns expected by PatientRepository / ARCHITECTURE.md
-- but never committed as migrations 014–017 (same gap as appointments before 037).
-- schema.sql still has the pre-booking legacy patients shape (doctor_id, name, phone…),
-- so DBs rebuilt from schema.sql miss clinic_id / full_name / contact_phone / etc.
-- and throw 42703 on booking + dashboard patient queries.
--
-- Idempotent: safe on prod where these columns already exist.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id),
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS age_years integer,
  ADD COLUMN IF NOT EXISTS relationship_to_contact text,
  ADD COLUMN IF NOT EXISTS consent_given boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_given_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.patients.clinic_id IS
  'Tenant scope for booking/dashboard queries (denormalized).';
COMMENT ON COLUMN public.patients.contact_phone IS
  'WhatsApp contact number — one contact may have multiple patient rows (pediatrics).';
COMMENT ON COLUMN public.patients.full_name IS
  'Display name used by booking bot and dashboard (legacy column is name).';
COMMENT ON COLUMN public.patients.date_of_birth IS
  'Exact or approximate DOB; see date_of_birth_is_approximate (031).';
COMMENT ON COLUMN public.patients.age_years IS
  'Age in years when collected as a plain age reply (may accompany approximate DOB).';
COMMENT ON COLUMN public.patients.relationship_to_contact IS
  'Relationship of this patient to the WhatsApp contact (e.g. self, child).';
COMMENT ON COLUMN public.patients.consent_given IS
  'DPDP consent captured at first data collection point.';
COMMENT ON COLUMN public.patients.consent_given_at IS
  'When consent_given was set true.';
COMMENT ON COLUMN public.patients.deleted_at IS
  'Soft delete — patients are never hard-deleted by the booking bot.';

CREATE INDEX IF NOT EXISTS idx_patients_clinic_contact
  ON public.patients (clinic_id, contact_phone)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_full_name
  ON public.patients (clinic_id, full_name)
  WHERE deleted_at IS NULL;
