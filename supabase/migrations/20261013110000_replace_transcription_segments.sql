-- Atomic transcript segment replacement.
-- Upsert by (transcription_id, segment_index), then delete only leftover indexes,
-- so a concurrent read never observes a transcription with zero rows mid-replace.

CREATE OR REPLACE FUNCTION public.replace_transcription_segments(
  p_transcription_id uuid,
  p_session_id uuid,
  p_segments jsonb
)
RETURNS SETOF public.transcription_segments
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_transcription_id IS NULL OR p_session_id IS NULL THEN
    RAISE EXCEPTION 'transcription_id and session_id are required';
  END IF;

  IF p_segments IS NULL OR jsonb_typeof(p_segments) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_segments must be a json array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_segments) AS elem
    WHERE elem->>'segment_index' IS NULL
       OR elem->>'start_seconds' IS NULL
       OR elem->>'end_seconds' IS NULL
       OR elem->>'text' IS NULL
  ) THEN
    RAISE EXCEPTION 'each segment requires segment_index, start_seconds, end_seconds, and text';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_segments) AS elem
    GROUP BY (elem->>'segment_index')::integer
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate segment_index in p_segments';
  END IF;

  -- Serialize replacements for this transcription. Readers do not take this lock.
  PERFORM 1
  FROM public.scribe_transcriptions
  WHERE id = p_transcription_id
    AND session_id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'transcription % not found for session %', p_transcription_id, p_session_id;
  END IF;

  INSERT INTO public.transcription_segments (
    transcription_id,
    session_id,
    segment_index,
    start_seconds,
    end_seconds,
    text,
    speaker,
    speaker_label,
    confidence,
    is_low_confidence,
    provider_metadata
  )
  SELECT
    p_transcription_id,
    p_session_id,
    (elem->>'segment_index')::integer,
    (elem->>'start_seconds')::numeric,
    (elem->>'end_seconds')::numeric,
    elem->>'text',
    COALESCE(NULLIF(elem->>'speaker', ''), 'A'),
    COALESCE(NULLIF(elem->>'speaker_label', ''), 'Unknown'),
    NULLIF(elem->>'confidence', '')::numeric,
    COALESCE((elem->>'is_low_confidence')::boolean, false),
    CASE
      WHEN jsonb_typeof(elem->'provider_metadata') = 'object' THEN elem->'provider_metadata'
      ELSE '{}'::jsonb
    END
  FROM jsonb_array_elements(p_segments) AS elem
  ON CONFLICT (transcription_id, segment_index)
  DO UPDATE SET
    session_id = EXCLUDED.session_id,
    start_seconds = EXCLUDED.start_seconds,
    end_seconds = EXCLUDED.end_seconds,
    text = EXCLUDED.text,
    speaker = EXCLUDED.speaker,
    speaker_label = EXCLUDED.speaker_label,
    confidence = EXCLUDED.confidence,
    is_low_confidence = EXCLUDED.is_low_confidence,
    provider_metadata = EXCLUDED.provider_metadata;

  DELETE FROM public.transcription_segments AS existing
  WHERE existing.transcription_id = p_transcription_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_segments) AS elem
      WHERE (elem->>'segment_index')::integer = existing.segment_index
    );

  RETURN QUERY
  SELECT *
  FROM public.transcription_segments
  WHERE transcription_id = p_transcription_id
  ORDER BY segment_index ASC;
END;
$$;

COMMENT ON FUNCTION public.replace_transcription_segments(uuid, uuid, jsonb) IS
  'Atomically replaces transcription_segments for one transcription. Upserts by (transcription_id, segment_index), then deletes leftover indexes.';

REVOKE ALL ON FUNCTION public.replace_transcription_segments(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.replace_transcription_segments(uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.replace_transcription_segments(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_transcription_segments(uuid, uuid, jsonb) TO service_role;
