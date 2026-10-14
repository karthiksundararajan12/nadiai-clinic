-- Sugar reading for the scribe visit vitals row. The earlier visit_vitals
-- migration is already applied, so these columns are added here.

ALTER TABLE public.visit_vitals
  ADD COLUMN IF NOT EXISTS sugar numeric(6,1),
  ADD COLUMN IF NOT EXISTS sugar_unit text,
  ADD COLUMN IF NOT EXISTS sugar_type text;

ALTER TABLE public.visit_vitals
  DROP CONSTRAINT IF EXISTS visit_vitals_sugar_unit_check;
ALTER TABLE public.visit_vitals
  ADD CONSTRAINT visit_vitals_sugar_unit_check
  CHECK (sugar_unit IS NULL OR sugar_unit IN ('mg/dL', 'mmol/L'));

ALTER TABLE public.visit_vitals
  DROP CONSTRAINT IF EXISTS visit_vitals_sugar_type_check;
ALTER TABLE public.visit_vitals
  ADD CONSTRAINT visit_vitals_sugar_type_check
  CHECK (sugar_type IS NULL OR sugar_type IN ('random', 'fasting', 'pp'));

COMMENT ON COLUMN public.visit_vitals.sugar IS
  'Blood sugar in sugar_unit. Random, fasting, or postprandial is sugar_type.';
