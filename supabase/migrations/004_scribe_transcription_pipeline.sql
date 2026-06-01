-- =============================================
-- Migration 004: AI Scribe Transcription Pipeline
-- Queue status, transcript persistence, segment-level confidence,
-- retry metadata, and Realtime support.
-- Run after 002_scribe_foundation.sql and 003_scribe_audio_uploads.sql.
-- =============================================

-- Expand the session state machine for transcription-specific lifecycle.
ALTER TABLE public.scribe_sessions
  DROP CONSTRAINT IF EXISTS scribe_sessions_status_check;
ALTER TABLE public.scribe_sessions
  ADD CONSTRAINT scribe_sessions_status_check
  CHECK (status IN (
    'CREATED', 'RECORDING', 'UPLOADING', 'UPLOADED',
    'TRANSCRIPTION_QUEUED', 'TRANSCRIBING', 'TRANSCRIBED', 'TRANSCRIPTION_FAILED',
    'READY_FOR_SOAP', 'GENERATING_SOAP', 'SOAP_READY',
    'GENERATING_PRESCRIPTION', 'COMPLETED', 'FAILED'
  ));

-- Strengthen scribe_transcriptions for production STT metadata.
CREATE TABLE IF NOT EXISTS public.scribe_transcriptions (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  full_text                 TEXT,
  segments                  JSONB       NOT NULL DEFAULT '[]',
  speaker_map               JSONB       NOT NULL DEFAULT '{"A":"Doctor","B":"Patient"}',
  low_confidence_segments   JSONB       NOT NULL DEFAULT '[]',
  low_confidence_count      INTEGER     NOT NULL DEFAULT 0,
  whisper_detected_language TEXT,
  transcription_model       TEXT        NOT NULL DEFAULT 'whisper-1',
  chunk_count               INTEGER     NOT NULL DEFAULT 0,
  cost_cents                INTEGER     NOT NULL DEFAULT 0,
  processing_duration_ms    INTEGER,
  status                    TEXT        NOT NULL DEFAULT 'pending',
  attempt_count             SMALLINT    NOT NULL DEFAULT 0,
  error                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT scribe_transcriptions_session_uniq UNIQUE (session_id)
);

ALTER TABLE public.scribe_transcriptions
  ADD COLUMN IF NOT EXISTS clinic_id                UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS doctor_id                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS provider                 TEXT NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS model                    TEXT NOT NULL DEFAULT 'whisper-1',
  ADD COLUMN IF NOT EXISTS language                 TEXT,
  ADD COLUMN IF NOT EXISTS text                     TEXT,
  ADD COLUMN IF NOT EXISTS average_confidence       NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS confidence_summary       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS provider_response        JSONB,
  ADD COLUMN IF NOT EXISTS queued_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at                TIMESTAMPTZ;

ALTER TABLE public.scribe_transcriptions
  DROP CONSTRAINT IF EXISTS scribe_transcriptions_status_check;
ALTER TABLE public.scribe_transcriptions
  ADD CONSTRAINT scribe_transcriptions_status_check
  CHECK (status IN ('queued', 'processing', 'completed', 'failed'));

ALTER TABLE public.scribe_transcriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage their transcriptions" ON public.scribe_transcriptions;
CREATE POLICY "Doctors can manage their transcriptions"
  ON public.scribe_transcriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.scribe_sessions s
      WHERE s.id = scribe_transcriptions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scribe_sessions s
      WHERE s.id = scribe_transcriptions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP TRIGGER IF EXISTS scribe_transcriptions_set_updated_at ON public.scribe_transcriptions;
CREATE TRIGGER scribe_transcriptions_set_updated_at
  BEFORE UPDATE ON public.scribe_transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_scribe_transcriptions_session
  ON public.scribe_transcriptions (session_id);

CREATE INDEX IF NOT EXISTS idx_scribe_transcriptions_clinic_status
  ON public.scribe_transcriptions (clinic_id, status, created_at DESC);

-- Normalized segment table for confidence, timestamps, and speaker labels.
CREATE TABLE IF NOT EXISTS public.transcription_segments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  transcription_id   UUID        NOT NULL REFERENCES public.scribe_transcriptions(id) ON DELETE CASCADE,
  session_id         UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  segment_index      INTEGER     NOT NULL,
  start_seconds      NUMERIC(10,3) NOT NULL CHECK (start_seconds >= 0),
  end_seconds        NUMERIC(10,3) NOT NULL CHECK (end_seconds >= start_seconds),
  text               TEXT        NOT NULL,
  speaker            TEXT        NOT NULL DEFAULT 'A',
  speaker_label      TEXT        NOT NULL DEFAULT 'Unknown',
  confidence         NUMERIC(5,4),
  is_low_confidence  BOOLEAN     NOT NULL DEFAULT FALSE,
  provider_metadata  JSONB       NOT NULL DEFAULT '{}',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transcription_segments_unique_idx UNIQUE (transcription_id, segment_index)
);

ALTER TABLE public.transcription_segments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage their transcription segments" ON public.transcription_segments;
CREATE POLICY "Doctors can manage their transcription segments"
  ON public.transcription_segments FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.scribe_sessions s
      WHERE s.id = transcription_segments.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.scribe_sessions s
      WHERE s.id = transcription_segments.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP TRIGGER IF EXISTS transcription_segments_set_updated_at ON public.transcription_segments;
CREATE TRIGGER transcription_segments_set_updated_at
  BEFORE UPDATE ON public.transcription_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_transcription_segments_session_order
  ON public.transcription_segments (session_id, segment_index ASC);

CREATE INDEX IF NOT EXISTS idx_transcription_segments_low_conf
  ON public.transcription_segments (session_id, is_low_confidence)
  WHERE is_low_confidence = TRUE;

-- Ensure queue supports transcription retries and worker diagnostics.
ALTER TABLE public.scribe_processing_queue
  ADD COLUMN IF NOT EXISTS locked_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by     TEXT,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

-- Replace job_type constraint to keep this table future-proof but explicit.
ALTER TABLE public.scribe_processing_queue
  DROP CONSTRAINT IF EXISTS scribe_processing_queue_job_type_check;
ALTER TABLE public.scribe_processing_queue
  ADD CONSTRAINT scribe_processing_queue_job_type_check
  CHECK (job_type IN (
    'transcribe', 'generate_soap', 'generate_summary',
    'generate_prescription', 'generate_icd'
  ));

-- Realtime: include full row images so clients can subscribe to status changes.
ALTER TABLE public.scribe_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.scribe_transcriptions REPLICA IDENTITY FULL;
ALTER TABLE public.transcription_segments REPLICA IDENTITY FULL;

-- Add tables to Supabase Realtime publication when it exists.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scribe_sessions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.scribe_transcriptions;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transcription_segments;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;
