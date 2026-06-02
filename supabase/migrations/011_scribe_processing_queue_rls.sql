-- =============================================
-- Migration 011: RLS for scribe_processing_queue
-- Doctors must insert/read/update jobs for their own sessions.
-- Run after 004_scribe_transcription_pipeline.sql.
-- =============================================

ALTER TABLE public.scribe_processing_queue ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.scribe_processing_queue TO authenticated;
GRANT ALL ON public.scribe_processing_queue TO service_role;

DROP POLICY IF EXISTS "Doctors read own processing queue jobs" ON public.scribe_processing_queue;
CREATE POLICY "Doctors read own processing queue jobs"
  ON public.scribe_processing_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = scribe_processing_queue.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors insert own processing queue jobs" ON public.scribe_processing_queue;
CREATE POLICY "Doctors insert own processing queue jobs"
  ON public.scribe_processing_queue FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = scribe_processing_queue.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors update own processing queue jobs" ON public.scribe_processing_queue;
CREATE POLICY "Doctors update own processing queue jobs"
  ON public.scribe_processing_queue FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = scribe_processing_queue.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = scribe_processing_queue.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );
