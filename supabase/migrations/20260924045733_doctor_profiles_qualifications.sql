-- Optional qualifications line on the prescription letterhead (MBBS, MD, …).
-- Specialization already exists. Registration stays optional; approval is not blocked.

ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS qualifications text;

COMMENT ON COLUMN public.doctor_profiles.qualifications IS
  'Optional degree line printed on the prescription letterhead (for example MBBS, MD).';
