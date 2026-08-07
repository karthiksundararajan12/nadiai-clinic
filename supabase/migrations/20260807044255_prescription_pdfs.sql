-- Prescription PDFs: sequential per-clinic Rx numbers + private PDF storage.
--
-- Generated as a best-effort side effect of PrescriptionReviewService.approve
-- (see features/scribe/services/prescription-pdf.service.js).
-- Storage path: {clinic_id}/{appointment_id}.pdf inside private `prescriptions`
-- bucket (full ref: prescriptions/{clinic_id}/{appointment_id}.pdf).
--
-- Invoice counters (migration 024) are invoice-specific — do not reuse them.

CREATE TABLE IF NOT EXISTS public.prescription_counters (
  clinic_id   uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE RESTRICT,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prescription_counters_last_number_nonneg CHECK (last_number >= 0)
);

COMMENT ON TABLE public.prescription_counters IS
  'Per-clinic sequential prescription number counters. next_prescription_number() increments atomically.';

CREATE OR REPLACE FUNCTION public.next_prescription_number(p_clinic_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  n bigint;
BEGIN
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'p_clinic_id is required';
  END IF;

  INSERT INTO public.prescription_counters (clinic_id, last_number)
  VALUES (p_clinic_id, 1)
  ON CONFLICT (clinic_id) DO UPDATE
    SET last_number = public.prescription_counters.last_number + 1,
        updated_at  = now()
  RETURNING last_number INTO n;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.next_prescription_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_prescription_number(uuid) TO service_role;

ALTER TABLE public.prescription_counters ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.prescription_drafts
  ADD COLUMN IF NOT EXISTS prescription_number text,
  ADD COLUMN IF NOT EXISTS prescription_seq    bigint,
  ADD COLUMN IF NOT EXISTS pdf_storage_path    text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prescription_drafts_clinic_number
  ON public.prescription_drafts (clinic_id, prescription_number)
  WHERE prescription_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prescription_drafts_clinic_seq
  ON public.prescription_drafts (clinic_id, prescription_seq)
  WHERE prescription_seq IS NOT NULL;

COMMENT ON COLUMN public.prescription_drafts.prescription_number IS
  'Stable per-clinic Rx number (RX-000042). Allocated on approval.';
COMMENT ON COLUMN public.prescription_drafts.pdf_storage_path IS
  'Object path inside the private prescriptions bucket.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prescriptions',
  'prescriptions',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
