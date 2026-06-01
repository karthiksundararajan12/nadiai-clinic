-- =============================================
-- Migration 002: AI Scribe Foundation
-- Scribe Recording Domain — Session, Chunks,
-- Transcriptions, Processing Queue, Audit Logs
-- Run in Supabase SQL Editor
-- =============================================

-- ─────────────────────────────────────────────────────────────
-- HELPER: updated_at trigger function (shared)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- EXPAND: scribe_sessions (existing table)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.scribe_sessions
  ADD COLUMN IF NOT EXISTS clinic_id               UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_id          UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status                  TEXT NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS upload_progress         SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_storage_prefix    TEXT,
  ADD COLUMN IF NOT EXISTS audio_total_chunks      INTEGER,
  ADD COLUMN IF NOT EXISTS audio_confirmed_chunks  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds  INTEGER,
  ADD COLUMN IF NOT EXISTS audio_size_bytes        BIGINT,
  ADD COLUMN IF NOT EXISTS edited_transcript       JSONB,
  ADD COLUMN IF NOT EXISTS speaker_corrections     JSONB,
  ADD COLUMN IF NOT EXISTS error_message           TEXT,
  ADD COLUMN IF NOT EXISTS is_finalized            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS signed_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at              TIMESTAMPTZ DEFAULT NOW();

-- Upload progress range constraint
ALTER TABLE public.scribe_sessions
  DROP CONSTRAINT IF EXISTS scribe_sessions_upload_progress_check;
ALTER TABLE public.scribe_sessions
  ADD CONSTRAINT scribe_sessions_upload_progress_check
  CHECK (upload_progress BETWEEN 0 AND 100);

-- Status domain constraint
ALTER TABLE public.scribe_sessions
  DROP CONSTRAINT IF EXISTS scribe_sessions_status_check;
ALTER TABLE public.scribe_sessions
  ADD CONSTRAINT scribe_sessions_status_check
  CHECK (status IN (
    'CREATED', 'RECORDING', 'UPLOADING', 'UPLOADED',
    'TRANSCRIBING', 'TRANSCRIBED', 'READY_FOR_SOAP',
    'GENERATING_SOAP', 'SOAP_READY', 'GENERATING_PRESCRIPTION',
    'COMPLETED', 'FAILED'
  ));

-- Auto-update updated_at
DROP TRIGGER IF EXISTS scribe_sessions_set_updated_at ON public.scribe_sessions;
CREATE TRIGGER scribe_sessions_set_updated_at
  BEFORE UPDATE ON public.scribe_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Performance indexes (partial — exclude soft-deleted rows)
CREATE INDEX IF NOT EXISTS idx_scribe_sessions_doctor_created
  ON public.scribe_sessions (doctor_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scribe_sessions_clinic_created
  ON public.scribe_sessions (clinic_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scribe_sessions_doctor_patient
  ON public.scribe_sessions (doctor_id, patient_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_scribe_sessions_doctor_status
  ON public.scribe_sessions (doctor_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

-- Watchdog index — find sessions stuck in processing states
CREATE INDEX IF NOT EXISTS idx_scribe_sessions_status_updated
  ON public.scribe_sessions (status, updated_at DESC);

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: scribe_audio_chunks
-- Tracks every 30-second audio chunk uploaded during a session.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scribe_audio_chunks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  chunk_index     INTEGER     NOT NULL,
  storage_path    TEXT        NOT NULL,
  size_bytes      INTEGER     NOT NULL CHECK (size_bytes > 0),
  duration_ms     INTEGER     NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  checksum        TEXT,
  confirmed       BOOLEAN     NOT NULL DEFAULT FALSE,
  upload_attempts SMALLINT    NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT scribe_audio_chunks_session_idx_uniq UNIQUE (session_id, chunk_index)
);

ALTER TABLE public.scribe_audio_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage their session chunks" ON public.scribe_audio_chunks;
CREATE POLICY "Doctors can manage their session chunks"
  ON public.scribe_audio_chunks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = scribe_audio_chunks.session_id
        AND s.doctor_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_scribe_audio_chunks_session_order
  ON public.scribe_audio_chunks (session_id, chunk_index ASC);

CREATE INDEX IF NOT EXISTS idx_scribe_audio_chunks_confirmed
  ON public.scribe_audio_chunks (session_id, confirmed);

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: scribe_transcriptions
-- One row per session. Created by the queue worker after Whisper.
-- ─────────────────────────────────────────────────────────────

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
  status                    TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count             SMALLINT    NOT NULL DEFAULT 0,
  error                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT scribe_transcriptions_session_uniq UNIQUE (session_id)
);

ALTER TABLE public.scribe_transcriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage their transcriptions" ON public.scribe_transcriptions;
CREATE POLICY "Doctors can manage their transcriptions"
  ON public.scribe_transcriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = scribe_transcriptions.session_id
        AND s.doctor_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS scribe_transcriptions_set_updated_at ON public.scribe_transcriptions;
CREATE TRIGGER scribe_transcriptions_set_updated_at
  BEFORE UPDATE ON public.scribe_transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: scribe_processing_queue
-- Async job queue for transcription and AI note generation.
-- No RLS — accessible by service role only.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scribe_processing_queue (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  job_type      TEXT        NOT NULL
    CHECK (job_type IN (
      'transcribe', 'generate_soap', 'generate_summary',
      'generate_prescription', 'generate_icd'
    )),
  priority      SMALLINT    NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  status        TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  attempt_count SMALLINT    NOT NULL DEFAULT 0,
  max_attempts  SMALLINT    NOT NULL DEFAULT 3,
  error         TEXT,
  metadata      JSONB       NOT NULL DEFAULT '{}',
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Queue claim index: ordered by priority (high first) then scheduled time
CREATE INDEX IF NOT EXISTS idx_scribe_queue_claim
  ON public.scribe_processing_queue (status, priority DESC, scheduled_at ASC)
  WHERE status = 'pending';

-- Prevent duplicate pending jobs for the same session + type
CREATE UNIQUE INDEX IF NOT EXISTS idx_scribe_queue_no_duplicate_pending
  ON public.scribe_processing_queue (session_id, job_type)
  WHERE status IN ('pending', 'processing');

-- Watchdog: find stuck jobs (processing > N minutes)
CREATE INDEX IF NOT EXISTS idx_scribe_queue_watchdog
  ON public.scribe_processing_queue (status, started_at)
  WHERE status = 'processing';

-- ─────────────────────────────────────────────────────────────
-- NEW TABLE: scribe_audit_logs
-- Immutable append-only audit trail.
-- Postgres trigger enforces immutability even for service role.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.scribe_audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Intentionally no FK on session_id: log survives session deletion
  session_id  UUID,
  clinic_id   UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id   UUID        NOT NULL REFERENCES auth.users(id)     ON DELETE RESTRICT,
  actor_id    UUID        NOT NULL,
  action      TEXT        NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  -- metadata MUST NOT contain PII: names, phone numbers, transcript text
  -- Use only IDs, status values, counts, model names, cost figures
  metadata    JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.scribe_audit_logs ENABLE ROW LEVEL SECURITY;

-- Doctors can read audit logs for their own clinic
DROP POLICY IF EXISTS "Doctors can read their clinic scribe audit logs" ON public.scribe_audit_logs;
CREATE POLICY "Doctors can read their clinic scribe audit logs"
  ON public.scribe_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.doctor_profiles dp
      WHERE dp.user_id    = auth.uid()
        AND dp.clinic_id  = scribe_audit_logs.clinic_id
    )
  );

-- Authenticated users may insert (service role bypasses RLS anyway)
DROP POLICY IF EXISTS "Authenticated users can insert scribe audit logs" ON public.scribe_audit_logs;
CREATE POLICY "Authenticated users can insert scribe audit logs"
  ON public.scribe_audit_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- IMMUTABILITY TRIGGER — blocks UPDATE and DELETE for everyone including service role
CREATE OR REPLACE FUNCTION public.enforce_audit_log_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RAISE EXCEPTION
    '[scribe_audit_logs] Audit records are immutable. % is not permitted. id=%',
    TG_OP, OLD.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS scribe_audit_logs_immutable ON public.scribe_audit_logs;
CREATE TRIGGER scribe_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON public.scribe_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_immutability();

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_scribe_audit_session_time
  ON public.scribe_audit_logs (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scribe_audit_clinic_action_time
  ON public.scribe_audit_logs (clinic_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scribe_audit_doctor_time
  ON public.scribe_audit_logs (doctor_id, created_at DESC);
