-- Booking-hub columns expected by AppointmentRepository / ARCHITECTURE.md
-- but never committed as migrations 014–017 (018 even references "migration 016").
-- schema.sql still has the pre-booking legacy appointments shape, so DBs
-- rebuilt from schema.sql + db push (e.g. nadiai-dev) miss these and throw
-- 42703 on findForClinic (clinic_id, contact_phone, payment_*, deleted_at, …).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_id uuid REFERENCES public.clinics(id),
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS payment_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_message_id text,
  ADD COLUMN IF NOT EXISTS razorpay_payment_id text,
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES public.appointments(id),
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

COMMENT ON COLUMN public.appointments.clinic_id IS
  'Denormalized tenant scope for booking/dashboard queries.';
COMMENT ON COLUMN public.appointments.contact_phone IS
  'Denormalized WhatsApp contact for webhook lookup without a join.';
COMMENT ON COLUMN public.appointments.payment_status IS
  'paid | failed | null (unpaid / not applicable).';
COMMENT ON COLUMN public.appointments.payment_amount IS
  'Consultation fee snapshotted when a PAYMENT_PENDING hold is created.';
COMMENT ON COLUMN public.appointments.deleted_at IS
  'Soft delete — appointments are never hard-deleted.';
COMMENT ON COLUMN public.appointments.wa_message_id IS
  'WhatsApp message idempotency key.';
COMMENT ON COLUMN public.appointments.razorpay_payment_id IS
  'Razorpay payment idempotency key.';
COMMENT ON COLUMN public.appointments.rescheduled_from_id IS
  'Prior appointment id when this row is a reschedule.';
COMMENT ON COLUMN public.appointments.cancelled_at IS
  'When status moved to cancelled.';
COMMENT ON COLUMN public.appointments.cancellation_reason IS
  'App-level cancel reason (hold_expired, payment_failed, patient_*, doctor_*, …).';

-- Idempotency uniques (safe if already present on prod).
CREATE UNIQUE INDEX IF NOT EXISTS appointments_wa_message_id_key
  ON public.appointments (wa_message_id)
  WHERE wa_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_razorpay_payment_id_key
  ON public.appointments (razorpay_payment_id)
  WHERE razorpay_payment_id IS NOT NULL;
