-- =============================================
-- Migration 010: SOAP version approved flag
-- Run after 009_prescription_review.sql.
-- =============================================

ALTER TABLE public.soap_note_versions
  ADD COLUMN IF NOT EXISTS is_approved_version BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_soap_note_versions_approved
  ON public.soap_note_versions (session_id, is_approved_version)
  WHERE is_approved_version = true;

-- Archive consultations that were approved before COMPLETED transition existed.
UPDATE public.scribe_sessions
SET status = 'COMPLETED', updated_at = NOW()
WHERE status = 'SOAP_APPROVED'
  AND deleted_at IS NULL;
