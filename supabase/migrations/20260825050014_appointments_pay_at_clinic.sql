-- Pay-at-clinic booking: how the fee is collected, plus dashboard
-- "Mark as Paid" audit columns. payment_status stays unconstrained text
-- (same as migration 037) and gains a new app-level value `pay_at_clinic`
-- meaning the appointment is confirmed but in-person payment is still due.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'online';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS marked_by uuid;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_payment_method_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_payment_method_check
  CHECK (payment_method IN ('online', 'pay_at_clinic'));

COMMENT ON COLUMN public.appointments.payment_method IS
  'How the consultation fee is collected: online (Razorpay) or pay_at_clinic.';

COMMENT ON COLUMN public.appointments.payment_status IS
  'paid | pending | pay_at_clinic | failed | refunded | not_required. pay_at_clinic = confirmed, awaiting in-person payment.';

COMMENT ON COLUMN public.appointments.paid_at IS
  'When payment was recorded — dashboard Mark as Paid for pay_at_clinic bookings.';

COMMENT ON COLUMN public.appointments.marked_by IS
  'auth.users.id of the doctor/staff who marked a pay-at-clinic appointment as paid.';
