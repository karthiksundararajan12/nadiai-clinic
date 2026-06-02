-- =============================================
-- Migration 009: Prescription Review Workspace
-- Doctor review, inline editing, versioning, approval, and audit trail.
-- Run after 008_prescription_draft.sql.
-- =============================================

-- ─────────────────────────────────────────────────────────────
-- 1. Extend scribe_sessions status for review lifecycle
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
    'PRESCRIPTION_REVIEW_REQUIRED', 'PRESCRIPTION_REVIEWING', 'PRESCRIPTION_APPROVED',
    'COMPLETED', 'FAILED'
  ));

-- ─────────────────────────────────────────────────────────────
-- 2. Extend prescription_drafts for review lifecycle
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.prescription_drafts
  DROP CONSTRAINT IF EXISTS prescription_drafts_status_check;

ALTER TABLE public.prescription_drafts
  ADD CONSTRAINT prescription_drafts_status_check
  CHECK (status IN (
    'generating', 'draft_ready',
    'review_required', 'reviewing', 'approved', 'rejected',
    'failed'
  ));

ALTER TABLE public.prescription_drafts
  ADD COLUMN IF NOT EXISTS original_draft        JSONB,
  ADD COLUMN IF NOT EXISTS reviewer_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_started_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason      TEXT,
  ADD COLUMN IF NOT EXISTS modification_summary  JSONB NOT NULL DEFAULT '{}';

-- Snapshot original_draft for existing draft_ready rows (forward migration safety)
UPDATE public.prescription_drafts
SET original_draft = draft
WHERE original_draft IS NULL
  AND draft IS NOT NULL
  AND draft <> '{}'::jsonb;

-- ─────────────────────────────────────────────────────────────
-- 3. prescription_reviews — one review session per draft
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prescription_reviews (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  prescription_draft_id     UUID        NOT NULL REFERENCES public.prescription_drafts(id) ON DELETE CASCADE,
  clinic_id                 UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewer_id               UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  status                    TEXT        NOT NULL DEFAULT 'reviewing'
    CHECK (status IN ('reviewing', 'approved', 'rejected')),

  -- Approval tracking
  approved_at               TIMESTAMPTZ,
  approved_by               UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  version_number_at_approval INTEGER,

  -- Rejection tracking
  rejected_at               TIMESTAMPTZ,
  rejection_reason          TEXT,

  -- Change summary — what the doctor changed vs the AI draft
  changes_summary           JSONB       NOT NULL DEFAULT '{}',

  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT prescription_reviews_draft_uniq UNIQUE (prescription_draft_id)
);

ALTER TABLE public.prescription_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage own prescription reviews" ON public.prescription_reviews;
CREATE POLICY "Doctors can manage own prescription reviews"
  ON public.prescription_reviews FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_reviews.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_reviews.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP TRIGGER IF EXISTS prescription_reviews_set_updated_at ON public.prescription_reviews;
CREATE TRIGGER prescription_reviews_set_updated_at
  BEFORE UPDATE ON public.prescription_reviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_prescription_reviews_session
  ON public.prescription_reviews (session_id, updated_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 4. prescription_review_events — granular audit trail
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prescription_review_events (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id                UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  prescription_draft_id     UUID        NOT NULL REFERENCES public.prescription_drafts(id) ON DELETE CASCADE,
  review_id                 UUID        REFERENCES public.prescription_reviews(id) ON DELETE SET NULL,
  clinic_id                 UUID        NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  actor_id                  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  event_type                TEXT        NOT NULL
    CHECK (event_type IN (
      'field_update', 'autosave', 'manual_save',
      'version_created', 'approved', 'rejected', 'review_started'
    )),

  -- For field-level edits: dot-path like "medications.0.dosage"
  field_path                TEXT,
  before_value              JSONB,
  after_value               JSONB,

  -- If this event created a version snapshot
  version_id                UUID REFERENCES public.prescription_draft_versions(id) ON DELETE SET NULL,

  metadata                  JSONB       NOT NULL DEFAULT '{}',
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prescription_review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can read own review events" ON public.prescription_review_events;
CREATE POLICY "Doctors can read own review events"
  ON public.prescription_review_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_review_events.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors can insert own review events" ON public.prescription_review_events;
CREATE POLICY "Doctors can insert own review events"
  ON public.prescription_review_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = prescription_review_events.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_prescription_review_events_session
  ON public.prescription_review_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prescription_review_events_draft
  ON public.prescription_review_events (prescription_draft_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 5. Realtime
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.prescription_reviews       REPLICA IDENTITY FULL;
ALTER TABLE public.prescription_review_events REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescription_reviews;
    ALTER PUBLICATION supabase_realtime ADD TABLE public.prescription_review_events;
  END IF;
EXCEPTION
  WHEN duplicate_object  THEN NULL;
  WHEN insufficient_privilege THEN NULL;
END $$;
