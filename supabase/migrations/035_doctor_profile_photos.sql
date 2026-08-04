-- Doctor profile photos: avatar_url on doctor_profiles + public storage bucket.
-- Uploads go through the Next.js API with the service-role client (no client-side
-- storage policies required). Public URLs are used for avatar display.

ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

COMMENT ON COLUMN public.doctor_profiles.avatar_url IS
  'Public Supabase Storage URL for the doctor profile photo (profile-photos bucket).';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-photos',
  'profile-photos',
  true,
  2097152, -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
