-- =============================================
-- Migration 013: SOAP rejection / review workflow
-- Version preservation, doctor edits, optional feedback.
-- Run after 012_soap_versions_view.sql.
-- =============================================

ALTER TABLE public.soap_notes
  DROP CONSTRAINT IF EXISTS soap_notes_status_check;
ALTER TABLE public.soap_notes
  ADD CONSTRAINT soap_notes_status_check
  CHECK (status IN (
    'generating', 'ready', 'review_required', 'reviewing',
    'approved', 'rejected', 'failed', 'regenerated', 'edited'
  ));

ALTER TABLE public.soap_notes
  ADD COLUMN IF NOT EXISTS edited_note JSONB,
  ADD COLUMN IF NOT EXISTS doctor_edited_at TIMESTAMPTZ;

ALTER TABLE public.soap_note_versions
  DROP CONSTRAINT IF EXISTS soap_note_versions_source_check;
ALTER TABLE public.soap_note_versions
  ADD CONSTRAINT soap_note_versions_source_check
  CHECK (source IN (
    'ai_generated', 'autosave', 'manual_save', 'approved', 'rejected',
    'regenerated', 'pre_regeneration', 'doctor_edited'
  ));

ALTER TABLE public.soap_note_edits
  DROP CONSTRAINT IF EXISTS soap_note_edits_edit_type_check;
ALTER TABLE public.soap_note_edits
  ADD CONSTRAINT soap_note_edits_edit_type_check
  CHECK (edit_type IN (
    'section_update', 'manual_save', 'autosave', 'approved', 'rejected',
    'regenerated', 'doctor_edited', 'review_feedback'
  ));

CREATE TABLE IF NOT EXISTS public.soap_note_feedback (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID        NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  soap_note_id          UUID        NOT NULL REFERENCES public.soap_notes(id) ON DELETE CASCADE,
  transcript_version_id UUID        REFERENCES public.transcript_versions(id) ON DELETE SET NULL,
  soap_version_id       UUID        REFERENCES public.soap_note_versions(id) ON DELETE SET NULL,
  review_action         TEXT        NOT NULL
    CHECK (review_action IN ('regenerated', 'manual_edit', 'rejected')),
  feedback_reasons      TEXT[]      NOT NULL DEFAULT '{}',
  other_reason          TEXT,
  generated_soap        JSONB,
  edited_soap           JSONB,
  note_status           TEXT        NOT NULL DEFAULT 'pending_review'
    CHECK (note_status IN ('pending_review', 'approved', 'rejected', 'regenerated', 'edited')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.soap_note_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage own soap note feedback" ON public.soap_note_feedback;
CREATE POLICY "Doctors can manage own soap note feedback"
  ON public.soap_note_feedback FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_note_feedback.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = soap_note_feedback.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

CREATE INDEX IF NOT EXISTS idx_soap_note_feedback_session
  ON public.soap_note_feedback (session_id, created_at DESC);

DROP TRIGGER IF EXISTS soap_note_feedback_set_updated_at ON public.soap_note_feedback;
CREATE TRIGGER soap_note_feedback_set_updated_at
  BEFORE UPDATE ON public.soap_note_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.soap_note_feedback REPLICA IDENTITY FULL;
