-- Read-only view exposing core SOAP version fields for reporting and integrations.
-- Canonical storage remains in soap_note_versions (JSONB note + full metadata).

CREATE OR REPLACE VIEW soap_versions AS
SELECT
  id,
  session_id,
  version_number,
  COALESCE(note->>'subjective', '')  AS subjective,
  COALESCE(note->>'objective', '')    AS objective,
  COALESCE(note->>'assessment', '')   AS assessment,
  COALESCE(note->>'plan', '')         AS plan,
  created_by                          AS edited_by,
  created_at,
  source,
  is_approved_version
FROM soap_note_versions;

COMMENT ON VIEW soap_versions IS
  'Convenience view over soap_note_versions with the four core SOAP fields denormalized.';
