-- Change Scribe default language from Hinglish to English for new rows.

ALTER TABLE public.doctor_profiles
  ALTER COLUMN default_scribe_language SET DEFAULT 'english';

ALTER TABLE public.scribe_sessions
  ALTER COLUMN language SET DEFAULT 'english';
