-- Respiratory rate for the visit vitals dialog. Nullable so existing rows stay valid.

alter table public.visit_vitals
  add column if not exists rr integer;

comment on column public.visit_vitals.rr is
  'Respiratory rate in breaths per minute. Null when not recorded.';
