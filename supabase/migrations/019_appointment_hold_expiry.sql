-- Adds hold_expires_at to support lazy-expiring PAYMENT_PENDING slot holds
-- for the WhatsApp booking bot's SLOT_SELECTION -> PAYMENT_PENDING flow.
--
-- See features/booking/repository/appointment.repository.js for how this
-- is used: availability queries (findTakenSlotStarts) filter out expired
-- holds at read time, and an idempotent "release" UPDATE runs immediately
-- before every booking attempt so the pre-existing appointments_no_double_
-- booking unique index only ever blocks genuinely active rows. See that
-- file's header comment for why a partial unique index predicate cannot
-- reference now() directly, which is why this is handled at the query
-- layer instead of the index definition.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz NULL;

COMMENT ON COLUMN public.appointments.hold_expires_at IS
  'For status = payment_pending only: when this slot hold expires. NULL means either not a payment_pending row, or a legacy payment_pending row with no expiry (treated as never-expiring/blocking). Read by SLOT_SELECTION availability queries and lazily released (status -> cancelled) immediately before a new booking attempt on the same (doctor_id, slot_start) once expired -- no background job.';
