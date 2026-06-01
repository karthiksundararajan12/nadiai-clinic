  -- =============================================
  -- Migration 003: AI Scribe Audio Uploads
  -- Private Supabase Storage bucket + upload chunk metadata
  -- Run in Supabase SQL Editor after 002_scribe_foundation.sql
  -- =============================================

  -- Private bucket for all consultation audio.
  -- Files are never public; reads should go through server-side signed URLs only.
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'scribe-audio',
    'scribe-audio',
    false,
    209715200,
    ARRAY[
      'audio/webm',
      'audio/ogg',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/aac'
    ]
  )
  ON CONFLICT (id) DO UPDATE
  SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

  -- Extra upload lifecycle metadata on each audio chunk.
  ALTER TABLE public.scribe_audio_chunks
    ADD COLUMN IF NOT EXISTS mime_type             TEXT,
    ADD COLUMN IF NOT EXISTS upload_status         TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS error_message         TEXT,
    ADD COLUMN IF NOT EXISTS signed_url_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS uploaded_at           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW();

  ALTER TABLE public.scribe_audio_chunks
    DROP CONSTRAINT IF EXISTS scribe_audio_chunks_upload_status_check;
  ALTER TABLE public.scribe_audio_chunks
    ADD CONSTRAINT scribe_audio_chunks_upload_status_check
    CHECK (upload_status IN ('pending', 'signed', 'uploaded', 'failed'));

  DROP TRIGGER IF EXISTS scribe_audio_chunks_set_updated_at ON public.scribe_audio_chunks;
  CREATE TRIGGER scribe_audio_chunks_set_updated_at
    BEFORE UPDATE ON public.scribe_audio_chunks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

  CREATE INDEX IF NOT EXISTS idx_scribe_audio_chunks_upload_status
    ON public.scribe_audio_chunks (session_id, upload_status, chunk_index ASC);

  -- Atomic helper used by the repository after each confirmed upload.
  CREATE OR REPLACE FUNCTION public.scribe_increment_confirmed_chunks(
    p_session_id UUID,
    p_total_chunks INTEGER
  )
  RETURNS VOID
  LANGUAGE plpgsql
  SET search_path = public
  AS $$
  DECLARE
    next_confirmed INTEGER;
    next_progress SMALLINT;
  BEGIN
    IF p_total_chunks IS NULL OR p_total_chunks <= 0 THEN
      RAISE EXCEPTION 'p_total_chunks must be positive';
    END IF;

    UPDATE public.scribe_sessions
    SET
      audio_confirmed_chunks = LEAST(audio_confirmed_chunks + 1, p_total_chunks),
      audio_total_chunks = p_total_chunks
    WHERE id = p_session_id
    RETURNING audio_confirmed_chunks INTO next_confirmed;

    IF next_confirmed IS NULL THEN
      RAISE EXCEPTION 'scribe session % not found', p_session_id;
    END IF;

    next_progress := LEAST(99, GREATEST(1, ROUND((next_confirmed::NUMERIC / p_total_chunks::NUMERIC) * 100)::SMALLINT));

    UPDATE public.scribe_sessions
    SET upload_progress = next_progress
    WHERE id = p_session_id;
  END;
  $$;

  REVOKE ALL ON FUNCTION public.scribe_increment_confirmed_chunks(UUID, INTEGER) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.scribe_increment_confirmed_chunks(UUID, INTEGER) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.scribe_increment_confirmed_chunks(UUID, INTEGER) TO service_role;

  -- Lock down the private bucket. We intentionally do not grant broad object
  -- read access to authenticated users. Uploads are performed through signed
  -- upload URLs created server-side.
  -- NOTE: Do not ALTER storage.objects ownership/RLS settings in hosted Supabase.
  -- The table is owned by Supabase internals and RLS is already enabled.

  DROP POLICY IF EXISTS "Doctors can view own scribe audio object metadata" ON storage.objects;
  CREATE POLICY "Doctors can view own scribe audio object metadata"
    ON storage.objects FOR SELECT
    USING (
      bucket_id = 'scribe-audio'
      AND EXISTS (
        SELECT 1
        FROM public.scribe_sessions s
        WHERE s.clinic_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND s.doctor_id::TEXT = (storage.foldername(storage.objects.name))[2]
          AND s.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND s.doctor_id = auth.uid()
          AND s.deleted_at IS NULL
      )
    );

  DROP POLICY IF EXISTS "Doctors can upload own scribe audio objects" ON storage.objects;
  CREATE POLICY "Doctors can upload own scribe audio objects"
    ON storage.objects FOR INSERT
    WITH CHECK (
      bucket_id = 'scribe-audio'
      AND EXISTS (
        SELECT 1
        FROM public.scribe_sessions s
        WHERE s.clinic_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND s.doctor_id::TEXT = (storage.foldername(storage.objects.name))[2]
          AND s.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND s.doctor_id = auth.uid()
          AND s.deleted_at IS NULL
      )
    );

  DROP POLICY IF EXISTS "Doctors can retry own scribe audio objects" ON storage.objects;
  CREATE POLICY "Doctors can retry own scribe audio objects"
    ON storage.objects FOR UPDATE
    USING (
      bucket_id = 'scribe-audio'
      AND EXISTS (
        SELECT 1
        FROM public.scribe_sessions s
        WHERE s.clinic_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND s.doctor_id::TEXT = (storage.foldername(storage.objects.name))[2]
          AND s.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND s.doctor_id = auth.uid()
          AND s.deleted_at IS NULL
      )
    )
    WITH CHECK (
      bucket_id = 'scribe-audio'
      AND EXISTS (
        SELECT 1
        FROM public.scribe_sessions s
        WHERE s.clinic_id::TEXT = (storage.foldername(storage.objects.name))[1]
          AND s.doctor_id::TEXT = (storage.foldername(storage.objects.name))[2]
          AND s.id::TEXT = (storage.foldername(storage.objects.name))[3]
          AND s.doctor_id = auth.uid()
          AND s.deleted_at IS NULL
      )
    );
