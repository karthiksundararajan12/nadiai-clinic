-- =============================================
-- Migration 036: Pediatric dosage reference + dose audit
-- Weight-based mg/kg suggestions for the prescription review UI.
-- Starter seed — confirm preferred top list with Ravikiran before expanding.
-- =============================================

-- ─────────────────────────────────────────────────────────────
-- 1. pediatric_dosage_reference — extendable drug dosing catalog
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pediatric_dosage_reference (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drug_name               text NOT NULL,
  mg_per_kg_min           numeric(8,3) NOT NULL CHECK (mg_per_kg_min > 0),
  mg_per_kg_max           numeric(8,3) NOT NULL CHECK (mg_per_kg_max >= mg_per_kg_min),
  max_single_dose_mg      numeric(10,2) NOT NULL CHECK (max_single_dose_mg > 0),
  frequency_per_day       integer NOT NULL CHECK (frequency_per_day BETWEEN 1 AND 12),
  formulation             text NOT NULL
    CHECK (formulation IN ('syrup', 'tablet', 'ors', 'other')),
  -- For syrups: e.g. 250mg/5ml → 50. NULL for tablet/ORS (ORS uses ml/kg in mg columns).
  concentration_mg_per_ml numeric(10,3)
    CHECK (concentration_mg_per_ml IS NULL OR concentration_mg_per_ml > 0),
  aliases                 text[] NOT NULL DEFAULT '{}',
  is_active               boolean NOT NULL DEFAULT true,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pediatric_dosage_reference_drug_name_uniq UNIQUE (drug_name)
);

COMMENT ON TABLE public.pediatric_dosage_reference IS
  'Clinic-extendable pediatric mg/kg dosing reference used by prescription suggestions. See features/scribe/lib/pediatric-dosage/.';
COMMENT ON COLUMN public.pediatric_dosage_reference.mg_per_kg_min IS
  'Per single dose mg/kg (or ml/kg when formulation = ors).';
COMMENT ON COLUMN public.pediatric_dosage_reference.concentration_mg_per_ml IS
  'Syrup strength as mg per ml (250mg/5ml → 50). NULL for non-syrup formulations.';

CREATE INDEX IF NOT EXISTS idx_pediatric_dosage_reference_active
  ON public.pediatric_dosage_reference (is_active, drug_name);

DROP TRIGGER IF EXISTS pediatric_dosage_reference_set_updated_at
  ON public.pediatric_dosage_reference;
CREATE TRIGGER pediatric_dosage_reference_set_updated_at
  BEFORE UPDATE ON public.pediatric_dosage_reference
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.pediatric_dosage_reference ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.pediatric_dosage_reference TO authenticated;
GRANT ALL ON public.pediatric_dosage_reference TO service_role;

-- Reference data is shared catalog (not clinic-scoped). Any authenticated
-- doctor may read active rows; writes stay service_role / migrations only.
DROP POLICY IF EXISTS "Authenticated doctors can read dosage reference"
  ON public.pediatric_dosage_reference;
CREATE POLICY "Authenticated doctors can read dosage reference"
  ON public.pediatric_dosage_reference FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ─────────────────────────────────────────────────────────────
-- 2. Seed starter drugs (idempotent)
-- ─────────────────────────────────────────────────────────────

INSERT INTO public.pediatric_dosage_reference (
  drug_name, mg_per_kg_min, mg_per_kg_max, max_single_dose_mg,
  frequency_per_day, formulation, concentration_mg_per_ml, aliases, notes
) VALUES
  (
    'Paracetamol', 10, 15, 1000, 4, 'syrup', 50,
    ARRAY['paracetamol','acetaminophen','crocin','dolo','calpol','pcm'],
    'Starter seed — confirm with Ravikiran. Common syrup 250mg/5ml.'
  ),
  (
    'Amoxicillin', 8, 15, 500, 3, 'syrup', 25,
    ARRAY['amoxicillin','amoxycillin','mox','novamox','trimox'],
    'Starter seed — confirm with Ravikiran. Per-dose range for TID (~20–40 mg/kg/day).'
  ),
  (
    'Ibuprofen', 5, 10, 400, 3, 'syrup', 20,
    ARRAY['ibuprofen','brufen','imoflam','ibugesic'],
    'Starter seed — confirm with Ravikiran. Common syrup 100mg/5ml.'
  ),
  (
    'ORS', 10, 20, 1000, 1, 'ors', NULL,
    ARRAY['ors','oral rehydration','oral rehydration solution','electral','orsolution'],
    'Starter seed — confirm with Ravikiran. mg_per_kg columns store ml/kg after each loose stool.'
  )
ON CONFLICT (drug_name) DO UPDATE SET
  mg_per_kg_min           = EXCLUDED.mg_per_kg_min,
  mg_per_kg_max           = EXCLUDED.mg_per_kg_max,
  max_single_dose_mg      = EXCLUDED.max_single_dose_mg,
  frequency_per_day       = EXCLUDED.frequency_per_day,
  formulation             = EXCLUDED.formulation,
  concentration_mg_per_ml = EXCLUDED.concentration_mg_per_ml,
  aliases                 = EXCLUDED.aliases,
  notes                   = EXCLUDED.notes,
  is_active               = true,
  updated_at              = now();

-- ─────────────────────────────────────────────────────────────
-- 3. pediatric_dose_audit_logs — suggested vs confirmed doses
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pediatric_dose_audit_logs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               uuid NOT NULL REFERENCES public.scribe_sessions(id) ON DELETE CASCADE,
  clinic_id                uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  doctor_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_id               uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  medication_index         integer,
  drug_name                text NOT NULL,
  reference_drug_name      text NOT NULL,
  weight_kg                numeric(6,2) NOT NULL CHECK (weight_kg > 0),
  suggested_dose_mg        numeric(12,3),
  suggested_dose_ml        numeric(12,3),
  suggested_dose_display   text,
  confirmed_dose_display   text,
  action                   text NOT NULL
    CHECK (action IN ('suggested', 'accepted', 'dismissed', 'exceeds_max')),
  metadata                 jsonb NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pediatric_dose_audit_logs IS
  'Audit/traction log for weight-based pediatric dose suggestions and doctor-confirmed doses.';

CREATE INDEX IF NOT EXISTS idx_pediatric_dose_audit_session
  ON public.pediatric_dose_audit_logs (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pediatric_dose_audit_clinic
  ON public.pediatric_dose_audit_logs (clinic_id, created_at DESC);

ALTER TABLE public.pediatric_dose_audit_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.pediatric_dose_audit_logs TO authenticated;
GRANT ALL ON public.pediatric_dose_audit_logs TO service_role;

DROP POLICY IF EXISTS "Doctors can read own session pediatric dose audits"
  ON public.pediatric_dose_audit_logs;
CREATE POLICY "Doctors can read own session pediatric dose audits"
  ON public.pediatric_dose_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = pediatric_dose_audit_logs.session_id
        AND s.doctor_id = auth.uid()
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "Doctors can insert pediatric dose audits for own sessions"
  ON public.pediatric_dose_audit_logs;
CREATE POLICY "Doctors can insert pediatric dose audits for own sessions"
  ON public.pediatric_dose_audit_logs FOR INSERT
  WITH CHECK (
    doctor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.scribe_sessions s
      WHERE s.id = pediatric_dose_audit_logs.session_id
        AND s.doctor_id = auth.uid()
        AND s.clinic_id = pediatric_dose_audit_logs.clinic_id
        AND s.deleted_at IS NULL
    )
  );
