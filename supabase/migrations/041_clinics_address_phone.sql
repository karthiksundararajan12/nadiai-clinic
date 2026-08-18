-- clinics.address / clinics.phone — used by ClinicRepository.findById,
-- findByWhatsAppPhoneNumberId, and updateById, but never committed as a
-- migration. schema.sql and nadiai-dev (schema.sql bootstrap) omit them →
-- Postgres 42703 on findById.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text;

COMMENT ON COLUMN public.clinics.address IS
  'Clinic street address (dashboard settings / booking clinic profile).';
COMMENT ON COLUMN public.clinics.phone IS
  'Clinic contact phone (dashboard settings / booking clinic profile).';
