-- Booking invoices: sequential per-clinic invoice numbers + private PDF storage.
--
-- Generated synchronously by PaymentWebhookService after a successful
-- payment.captured confirm (see features/booking/services/invoice.service.js).
-- Storage path convention: invoices/{clinic_id}/{appointment_id}.pdf
-- inside the private `booking-invoices` bucket.

-- Per-clinic sequential counter (atomic via UPSERT ... RETURNING).
CREATE TABLE IF NOT EXISTS public.booking_invoice_counters (
  clinic_id   uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE RESTRICT,
  last_number bigint NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_invoice_counters_last_number_nonneg CHECK (last_number >= 0)
);

COMMENT ON TABLE public.booking_invoice_counters IS
  'Per-clinic sequential invoice number counters. next_booking_invoice_number() increments atomically.';

-- Invoice ledger: one row per paid appointment (idempotent on appointment_id).
CREATE TABLE IF NOT EXISTS public.booking_invoices (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            uuid NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  appointment_id       uuid NOT NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,
  invoice_number       text NOT NULL,
  invoice_seq          bigint NOT NULL,
  razorpay_payment_id  text NULL,
  storage_path         text NOT NULL,
  amount               numeric(12, 2) NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_invoices_clinic_appointment_key UNIQUE (clinic_id, appointment_id),
  CONSTRAINT booking_invoices_clinic_number_key UNIQUE (clinic_id, invoice_number),
  CONSTRAINT booking_invoices_clinic_seq_key UNIQUE (clinic_id, invoice_seq)
);

CREATE INDEX IF NOT EXISTS idx_booking_invoices_clinic_created
  ON public.booking_invoices (clinic_id, created_at DESC);

COMMENT ON TABLE public.booking_invoices IS
  'Consultation invoices issued after Razorpay payment.captured. Numbers are sequential per clinic_id.';

-- Atomic next number for a clinic. Safe under concurrent webhook deliveries.
CREATE OR REPLACE FUNCTION public.next_booking_invoice_number(p_clinic_id uuid)
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

  INSERT INTO public.booking_invoice_counters (clinic_id, last_number)
  VALUES (p_clinic_id, 1)
  ON CONFLICT (clinic_id) DO UPDATE
    SET last_number = public.booking_invoice_counters.last_number + 1,
        updated_at  = now()
  RETURNING last_number INTO n;

  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.next_booking_invoice_number(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_booking_invoice_number(uuid) TO service_role;

ALTER TABLE public.booking_invoice_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_invoices ENABLE ROW LEVEL SECURITY;

-- Private bucket for invoice PDFs. Service-role uploads from the webhook;
-- Meta fetches via short-lived signed URLs only — never a public object URL.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'booking-invoices',
  'booking-invoices',
  false,
  5242880, -- 5 MB
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
