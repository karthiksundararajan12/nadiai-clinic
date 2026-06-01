-- =============================================
-- Migration 006: SOAP Note Generation
-- Structured SOAP notes + immutable version history.
-- Run after 005_transcript_review_workspace.sql.
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
    'GENERATING_PRESCRIPTION', 'COMPLETED', 'FAILED'
  ));

CREATE TABLE IF NOT EXISTS public.soap_notes (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  transcript_version_id UUID        REFERENCES public.transcript_versions(id) ON DELETE SET NULL,
  clinic_id             UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_id            UUID        REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id        UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,
  status                TEXT        NOT NULL DEFAULT 'review_required'
    CHECK (status IN ('generating', 'ready', 'review_required', 'approved', 'failed')),
  note                  JSONB       NOT NULL DEFAULT '{}',
  subjective            TEXT        NOT NULL DEFAULT '',
  objective             TEXT        NOT NULL DEFAULT '',
  assessment            TEXT        NOT NULL DEFAULT '',
  plan                  TEXT        NOT NULL DEFAULT '',
  chief_complaint       TEXT        NOT NULL DEFAULT '',
  history_of_present_illness TEXT   NOT NULL DEFAULT '',
  clinical_summary      TEXT        NOT NULL DEFAULT '',
  provider              TEXT        NOT NULL DEFAULT 'anthropic',
  model                 TEXT        NOT NULL,
  prompt_version        TEXT        NOT NULL,
  generation_metadata   JSONB       NOT NULL DEFAULT '{}',
  input_hash            TEXT        NOT NULL,
  error_message         TEXT,
  generated_at          TIMESTAMPTZ,
  reviewed_at           TIMESTAMPTZ,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT soap_notes_session_uniq UNIQUE (session_id)
);

ALTER TABLE public.soap_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage own soap notes" ON public.soap_notes;
CREATE POLICY "Doctors can manage own soap notes"
  ON public.soap_notes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_notes.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_notes.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP TRIGGER IF EXISTS soap_notes_set_updated_at ON public.soap_notes;
CREATE TRIGGER soap_notes_set_updated_at
  BEFORE UPDATE ON public.soap_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_soap_notes_clinic_status
  ON public.soap_notes (clinic_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_soap_notes_doctor_generated
  ON public.soap_notes (doctor_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.soap_note_versions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  soap_note_id          UUID        NOT NULL REFERENCES public.soap_notes(id) ON DELETE CASCADE,
  session_id            UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  transcript_version_id UUID        REFERENCES public.transcript_versions(id) ON DELETE SET NULL,
  clinic_id             UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  version_number        INTEGER     NOT NULL,
  note                  JSONB       NOT NULL,
  provider              TEXT        NOT NULL DEFAULT 'anthropic',
  model                 TEXT        NOT NULL,
  prompt_version        TEXT        NOT NULL,
  input_hash            TEXT        NOT NULL,
  generation_metadata   JSONB       NOT NULL DEFAULT '{}',
  created_by            UUID        NOT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT soap_note_versions_note_version_uniq UNIQUE (soap_note_id, version_number)
);

ALTER TABLE public.soap_note_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own soap note versions" ON public.soap_note_versions;
CREATE POLICY "Doctors can read own soap note versions"
  ON public.soap_note_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_note_versions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors can insert own soap note versions" ON public.soap_note_versions;
CREATE POLICY "Doctors can insert own soap note versions"
  ON public.soap_note_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_note_versions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_soap_note_versions_session_created
  ON public.soap_note_versions (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_soap_note_versions_note_number
  ON public.soap_note_versions (soap_note_id, version_number DESC);

ALTER TABLE public.soap_notes REPLICA IDENTITY FULL;
ALTER TABLE public.soap_note_versions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.soap_notes;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.soap_note_versions;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;
