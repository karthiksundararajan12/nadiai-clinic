-- 038_schema_drift_fixes.sql
-- Catch-up: columns added by earlier migrations but omitted from schema.sql.
-- Safe/idempotent (ADD COLUMN IF NOT EXISTS). No-op on DBs that already applied
-- the original migrations.
--
-- ALTERs on tables that only exist after their CREATE migrations (002+) are
-- guarded: if the table is missing (schema.sql-only bootstrap that never ran
-- those CREATE migrations), skip rather than fail with 42P01.
--
-- Prefer: never run schema.sql in the SQL Editor; use `supabase db push` only.

-- clinics (021_booking_reminders) — always in schema.sql
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS reminder_24h_offset_minutes integer NOT NULL DEFAULT 1440,
  ADD COLUMN IF NOT EXISTS reminder_2h_offset_minutes integer NOT NULL DEFAULT 120;

-- doctor_profiles (035_doctor_profile_photos; 022/023 already present in schema CREATE)
ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- patients (031_patients_date_of_birth_is_approximate)
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS date_of_birth_is_approximate boolean NOT NULL DEFAULT false;

-- scribe_sessions (002_scribe_foundation) — table always in schema.sql
ALTER TABLE public.scribe_sessions
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS upload_progress SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_storage_prefix TEXT,
  ADD COLUMN IF NOT EXISTS audio_total_chunks INTEGER,
  ADD COLUMN IF NOT EXISTS audio_confirmed_chunks INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS audio_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS edited_transcript JSONB,
  ADD COLUMN IF NOT EXISTS speaker_corrections JSONB,
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Helper: only ALTER when the relation exists (migration-created tables).
CREATE OR REPLACE FUNCTION public._038_add_cols_if_table_exists(p_table text, p_sql text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF to_regclass('public.' || p_table) IS NOT NULL THEN
    EXECUTE p_sql;
  END IF;
END;
$$;

-- scribe_audio_chunks (003) — CREATE in 002
SELECT public._038_add_cols_if_table_exists(
  'scribe_audio_chunks',
  $sql$
    ALTER TABLE public.scribe_audio_chunks
      ADD COLUMN IF NOT EXISTS mime_type TEXT,
      ADD COLUMN IF NOT EXISTS upload_status TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS error_message TEXT,
      ADD COLUMN IF NOT EXISTS signed_url_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  $sql$
);

-- scribe_processing_queue (004) — CREATE in 002
SELECT public._038_add_cols_if_table_exists(
  'scribe_processing_queue',
  $sql$
    ALTER TABLE public.scribe_processing_queue
      ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS locked_by TEXT,
      ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ
  $sql$
);

-- scribe_transcriptions (004) — CREATE in 002
SELECT public._038_add_cols_if_table_exists(
  'scribe_transcriptions',
  $sql$
    ALTER TABLE public.scribe_transcriptions
      ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS doctor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'openai',
      ADD COLUMN IF NOT EXISTS model TEXT NOT NULL DEFAULT 'whisper-1',
      ADD COLUMN IF NOT EXISTS language TEXT,
      ADD COLUMN IF NOT EXISTS text TEXT,
      ADD COLUMN IF NOT EXISTS average_confidence NUMERIC(5,4),
      ADD COLUMN IF NOT EXISTS confidence_summary JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS provider_response JSONB,
      ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ
  $sql$
);

-- soap_notes (007, 013) — CREATE in 006
SELECT public._038_add_cols_if_table_exists(
  'soap_notes',
  $sql$
    ALTER TABLE public.soap_notes
      ADD COLUMN IF NOT EXISTS original_note JSONB,
      ADD COLUMN IF NOT EXISTS modification_summary JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS edited_note JSONB,
      ADD COLUMN IF NOT EXISTS doctor_edited_at TIMESTAMPTZ
  $sql$
);

-- soap_note_versions (007, 010) — CREATE in 006
SELECT public._038_add_cols_if_table_exists(
  'soap_note_versions',
  $sql$
    ALTER TABLE public.soap_note_versions
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai_generated',
      ADD COLUMN IF NOT EXISTS diff_metadata JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS is_approved_version BOOLEAN NOT NULL DEFAULT false
  $sql$
);

-- prescription_drafts (009, prescription_pdfs) — CREATE in 008
SELECT public._038_add_cols_if_table_exists(
  'prescription_drafts',
  $sql$
    ALTER TABLE public.prescription_drafts
      ADD COLUMN IF NOT EXISTS original_draft JSONB,
      ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS modification_summary JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS prescription_number text,
      ADD COLUMN IF NOT EXISTS prescription_seq bigint,
      ADD COLUMN IF NOT EXISTS pdf_storage_path text
  $sql$
);

-- vaccination_schedules (033) — CREATE in 030
SELECT public._038_add_cols_if_table_exists(
  'vaccination_schedules',
  $sql$
    ALTER TABLE public.vaccination_schedules
      ADD COLUMN IF NOT EXISTS reminder_attempts integer NOT NULL DEFAULT 0
  $sql$
);

DROP FUNCTION IF EXISTS public._038_add_cols_if_table_exists(text, text);
