-- Default language pre-selected on the Scribe recording page (per-session override still allowed).

ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS default_scribe_language text NOT NULL DEFAULT 'hinglish';

COMMENT ON COLUMN public.doctor_profiles.default_scribe_language IS
  'Default Scribe transcription language (english, hinglish, or hindi). Used as the initial selection on the Scribe page.';
