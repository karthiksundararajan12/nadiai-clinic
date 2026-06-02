-- =============================================
-- Migration 008: Prescription Draft Generation
-- Generates a doctor-reviewable prescription draft from an approved SOAP note.
-- Run after 007_soap_review_workspace.sql.
-- =============================================

-- ─────────────────────────────────────────────────────────────
-- 1. Extend scribe_sessions status to include prescription states
-- ─────────────────────────────────────────────────────────────

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
    'GENERATING_PRESCRIPTION', 'PRESCRIPTION_DRAFT_READY',
    'COMPLETED', 'FAILED'
  ));

-- ─────────────────────────────────────────────────────────────
-- 2. prescription_drafts — one current draft per session
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prescription_drafts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  soap_note_id          UUID        REFERENCES public.soap_notes(id) ON DELETE SET NULL,
  clinic_id             UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_id            UUID        REFERENCES public.patients(id) ON DELETE SET NULL,
  appointment_id        UUID        REFERENCES public.appointments(id) ON DELETE SET NULL,

  -- Draft payload — must match PrescriptionDraftSchema
  draft                 JSONB       NOT NULL DEFAULT '{}',

  -- Generation provenance
  provider              TEXT        NOT NULL DEFAULT 'anthropic',
  model                 TEXT        NOT NULL DEFAULT '',
  prompt_version        TEXT        NOT NULL DEFAULT 'prescription_indian_gp_v1',
  generation_metadata   JSONB       NOT NULL DEFAULT '{}',
  input_hash            TEXT        NOT NULL DEFAULT '',

  -- Lifecycle
  status                TEXT        NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'draft_ready', 'failed')),
  error_message         TEXT,
  generated_at          TIMESTAMPTZ,

  -- Timestamps
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One draft per session; re-generation upserts this row.
  CONSTRAINT prescription_drafts_session_uniq UNIQUE (session_id)
);

ALTER TABLE public.prescription_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage own prescription drafts" ON public.prescription_drafts;
CREATE POLICY "Doctors can manage own prescription drafts"
  ON public.prescription_drafts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_drafts.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_drafts.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP TRIGGER IF EXISTS prescription_drafts_set_updated_at ON public.prescription_drafts;
CREATE TRIGGER prescription_drafts_set_updated_at
  BEFORE UPDATE ON public.prescription_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prescription_drafts_clinic_status
  ON public.prescription_drafts (clinic_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescription_drafts_doctor_generated
  ON public.prescription_drafts (doctor_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescription_drafts_soap_note
  ON public.prescription_drafts (soap_note_id);

-- ─────────────────────────────────────────────────────────────
-- 3. prescription_draft_versions — immutable version snapshots
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prescription_draft_versions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_draft_id  UUID        NOT NULL REFERENCES public.prescription_drafts(id) ON DELETE CASCADE,
  session_id             UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  soap_note_id           UUID        REFERENCES public.soap_notes(id) ON DELETE SET NULL,
  clinic_id              UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id              UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  version_number         INTEGER     NOT NULL,
  draft                  JSONB       NOT NULL,

  -- Provenance snapshot — identical to parent row at time of creation
  provider               TEXT        NOT NULL,
  model                  TEXT        NOT NULL,
  prompt_version         TEXT        NOT NULL,
  input_hash             TEXT        NOT NULL,
  generation_metadata    JSONB       NOT NULL DEFAULT '{}',

  created_by             UUID        NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prescription_draft_versions_uniq UNIQUE (prescription_draft_id, version_number)
);

ALTER TABLE public.prescription_draft_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own prescription versions" ON public.prescription_draft_versions;
CREATE POLICY "Doctors can read own prescription versions"
  ON public.prescription_draft_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_draft_versions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors can insert own prescription versions" ON public.prescription_draft_versions;
CREATE POLICY "Doctors can insert own prescription versions"
  ON public.prescription_draft_versions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_draft_versions.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_prescription_draft_versions_session
  ON public.prescription_draft_versions (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescription_draft_versions_draft_number
  ON public.prescription_draft_versions (prescription_draft_id, version_number DESC);

-- ─────────────────────────────────────────────────────────────
-- 4. Realtime publication
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.prescription_drafts REPLICA IDENTITY FULL;
ALTER TABLE public.prescription_draft_versions REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescription_drafts;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescription_draft_versions;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;
