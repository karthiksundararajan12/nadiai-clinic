-- =============================================
-- Migration 007: SOAP Review Workspace
-- Doctor editing, approval, rejection, and edit audit trail.
-- Run after 006_soap_note_generation.sql.
-- =============================================

ALTER TABLE public.scribe_sessions
  DROP CONSTRAINT IF EXISTS scribe_sessions_status_check;
ALTER TABLE public.scribe_sessions
  ADD CONSTRAINT scribe_sessions_status_check
  CHECK (status IN (
    'CREATED', 'RECORDING', 'UPLOADING', 'UPLOADED',
    'TRANSCRIPTION_QUEUED', 'TRANSCRIBING', 'TRANSCRIBED', 'TRANSCRIPTION_FAILED',
    'REVIEWING', 'REVIEW_COMPLETED',
    'READY_FOR_SOAP', 'GENERATING_SOAP', 'SOAP_READY', 'SOAP_REVIEW_REQUIRED',
    'SOAP_REVIEWING', 'SOAP_APPROVED', 'READY_FOR_PRESCRIPTION',
    'GENERATING_PRESCRIPTION', 'COMPLETED', 'FAILED'
  ));

ALTER TABLE public.soap_notes
  DROP CONSTRAINT IF EXISTS soap_notes_status_check;
ALTER TABLE public.soap_notes
  ADD CONSTRAINT soap_notes_status_check
  CHECK (status IN ('generating', 'ready', 'review_required', 'reviewing', 'approved', 'rejected', 'failed'));

ALTER TABLE public.soap_notes
  ADD COLUMN IF NOT EXISTS original_note JSONB,
  ADD COLUMN IF NOT EXISTS modification_summary JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

UPDATE public.soap_notes
SET original_note = note
WHERE original_note IS NULL
  AND note IS NOT NULL
  AND note <> '{}'::jsonb;

ALTER TABLE public.soap_note_versions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ai_generated'
    CHECK (source IN ('ai_generated', 'autosave', 'manual_save', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS diff_metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.soap_note_edits (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  soap_note_id    UUID        NOT NULL REFERENCES public.soap_notes(id) ON DELETE CASCADE,
  session_id      UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  clinic_id       UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_id        UUID        NOT NULL,
  section_key     TEXT        CHECK (section_key IN (
    'chiefComplaint', 'historyOfPresentIllness', 'subjective',
    'objective', 'assessment', 'plan', 'clinicalSummary'
  )),
  edit_type       TEXT        NOT NULL CHECK (edit_type IN ('section_update', 'manual_save', 'autosave', 'approved', 'rejected')),
  before_value    JSONB,
  after_value     JSONB,
  diff_metadata   JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.soap_note_edits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own soap note edits" ON public.soap_note_edits;
CREATE POLICY "Doctors can read own soap note edits"
  ON public.soap_note_edits FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_note_edits.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors can insert own soap note edits" ON public.soap_note_edits;
CREATE POLICY "Doctors can insert own soap note edits"
  ON public.soap_note_edits FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_note_edits.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_soap_note_edits_session_created
  ON public.soap_note_edits (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_soap_note_edits_note_section
  ON public.soap_note_edits (soap_note_id, section_key, created_at DESC);

ALTER TABLE public.soap_note_edits REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.soap_note_edits;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;
