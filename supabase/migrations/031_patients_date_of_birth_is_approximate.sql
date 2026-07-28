-- =============================================
-- Migration 031: patients.date_of_birth_is_approximate
--
-- The WhatsApp booking bot's AWAITING_AGE_OR_DOB prompt accepts either a
-- real date of birth or a plain age in years (parseAgeOrDob, features/
-- booking/lib/patient-input.js). When only an age is given, PatientCollectionService
-- now derives an *approximate* date_of_birth (Jan 1 of the inferred birth
-- year) so vaccination-schedule auto-seeding (VaccinationSeedingService)
-- still has something to compute IAP due dates from, instead of silently
-- skipping every plain-age registration.
--
-- This flag records that a row's date_of_birth is such an approximation,
-- not a real DOB, so it can be surfaced/handled differently later (e.g.
-- dashboard display, or prompting to confirm/replace it) rather than being
-- indistinguishable from an exact date. Defaults to false so every
-- pre-existing row (all of which carry either a real date_of_birth or
-- null) is correctly marked as non-approximate.
-- =============================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS date_of_birth_is_approximate BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.patients.date_of_birth_is_approximate IS
  'true when date_of_birth was derived from a plain age-in-years reply (Jan 1 of the inferred birth year) rather than a real date of birth.';
