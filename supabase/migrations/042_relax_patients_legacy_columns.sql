-- Relax legacy patients.doctor_id / patients.name NOT NULL constraints.
-- nadiai-dev was bootstrapped from schema.sql (legacy shape). Production's
-- patients table is hub-only (no doctor_id/name). Booking PatientRepository.create
-- writes clinic_id/full_name/contact_phone and leaves doctor_id/name null → 23502
-- on nadiai-dev only.

ALTER TABLE public.patients ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE public.patients ALTER COLUMN name DROP NOT NULL;
