-- =============================================
-- Migration 005: Transcript Review Workspace
-- Review status lifecycle, transcript versions, edit history,
-- and Realtime support for review/correction workflow.
-- Run after 004_scribe_transcription_pipeline.sql.
-- =============================================

ALTER TABLE public.scribe_sessions
  DROP CONSTRAINT IF EXISTS scribe_sessions_status_check;
ALTER TABLE public.scribe_sessions
  ADD CONSTRAINT scribe_sessions_status_check
  CHECK (status IN (
    'CREATED', 'RECORDING', 'UPLOADING', 'UPLOADED',
    'TRANSCRIPTION_QUEUED', 'TRANSCRIBING', 'TRANSCRIBED', 'TRANSCRIPTION_FAILED',
    'REVIEWING', 'REVIEW_COMPLETED',
    'READY_FOR_SOAP', 'GENERATING_SOAP', 'SOAP_READY',
    'GENERATING_PRESCRIPTION', 'COMPLETED', 'FAILED'
  ));

-- Version snapshots of reviewed transcripts.
CREATE TABLE IF NOT EXISTS public.transcript_versions (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  transcription_id   UUID        REFERENCES public.scribe_transcriptions(id) ON DELETE SET NULL,
  clinic_id          UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  version_number     INTEGER     NOT NULL,
  label              TEXT,
  source             TEXT        NOT NULL DEFAULT 'manual_save',
  full_text          TEXT        NOT NULL DEFAULT '',
  segments_snapshot  JSONB       NOT NULL DEFAULT '[]',
  change_summary     JSONB       NOT NULL DEFAULT '{}',
  created_by         UUID        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transcript_versions_session_version_uniq UNIQUE (session_id, version_number)
);

ALTER TABLE public.transcript_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own transcript versions" ON public.transcript_versions;
CREATE POLICY "Doctors can read own transcript versions"
  ON public.transcript_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = transcript_versions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors can insert own transcript versions" ON public.transcript_versions;
CREATE POLICY "Doctors can insert own transcript versions"
  ON public.transcript_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = transcript_versions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_transcript_versions_session_created
  ON public.transcript_versions (session_id, created_at DESC);

-- Granular edit log. Append-only audit-ish table for transcript corrections.
CREATE TABLE IF NOT EXISTS public.transcript_edits (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  transcription_id   UUID        REFERENCES public.scribe_transcriptions(id) ON DELETE SET NULL,
  segment_id         UUID        REFERENCES public.transcription_segments(id) ON DELETE SET NULL,
  clinic_id          UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_id           UUID        NOT NULL,
  edit_type          TEXT        NOT NULL CHECK (edit_type IN ('text', 'speaker', 'bulk_save', 'review_started', 'review_completed', 'version_restore')),
  before_value       JSONB,
  after_value        JSONB,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transcript_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own transcript edits" ON public.transcript_edits;
CREATE POLICY "Doctors can read own transcript edits"
  ON public.transcript_edits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = transcript_edits.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors can insert own transcript edits" ON public.transcript_edits;
CREATE POLICY "Doctors can insert own transcript edits"
  ON public.transcript_edits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = transcript_edits.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_transcript_edits_session_created
  ON public.transcript_edits (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transcript_edits_segment_created
  ON public.transcript_edits (segment_id, created_at DESC);

-- Realtime support.
ALTER TABLE public.transcript_versions REPLICA IDENTITY FULL;
ALTER TABLE public.transcript_edits REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transcript_versions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transcript_edits;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;
