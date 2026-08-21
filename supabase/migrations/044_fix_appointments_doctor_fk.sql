-- Retarget appointments.doctor_id FK from auth.users to doctor_profiles.
-- nadiai-dev was bootstrapped from schema.sql (legacy REFERENCES auth.users).
-- Production and ARCHITECTURE.md use doctor_profiles(id). Booking
-- createIfAvailable writes doctor_profiles.id → 23503 on nadiai-dev only.

ALTER TABLE public.appointments DROP CONSTRAINT appointments_doctor_id_fkey;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_doctor_id_fkey
  FOREIGN KEY (doctor_id) REFERENCES public.doctor_profiles(id) ON DELETE CASCADE;
