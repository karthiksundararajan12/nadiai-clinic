-- Relax legacy appointments.patient_name / date / time NOT NULL constraints.
-- nadiai-dev was bootstrapped from schema.sql (legacy shape). Production's
-- appointments table is hub-only (no patient_name/date/time). Booking
-- AppointmentsRepository.createIfAvailable writes clinic_id/slot_start/slot_end
-- and leaves patient_name/date/time null → 23502 on nadiai-dev only.

ALTER TABLE public.appointments ALTER COLUMN patient_name DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN date DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN time DROP NOT NULL;
