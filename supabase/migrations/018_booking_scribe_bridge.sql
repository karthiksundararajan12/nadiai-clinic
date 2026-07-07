-- =============================================
-- Migration 018: Booking → Scribe Bridge
--
-- Closes the gap from Phase 7 of the booking plan: the moment a
-- booking_appointments row is marked 'confirmed' (whoever does it — the
-- future payment-confirm API, a staff member on the dashboard, or a manual
-- UPDATE), this trigger atomically:
--   1. Upserts a public.patients row (what Scribe actually reads) and
--      stores its id on booking_patients.linked_patient_id
--   2. Upserts a public.appointments row and stores its id on
--      booking_appointments.linked_appointment_id
-- No application code has to remember to call anything — Scribe's existing
-- queries (features/scribe/consultation-workspace/hooks/use-patient-for-session.js
-- etc.) keep reading public.patients/public.appointments completely
-- unchanged and will simply see the new row.
--
-- Appointments only ever reach 'confirmed' via an UPDATE (the default on
-- insert is 'pending_payment'), so this is implemented as a single
-- AFTER UPDATE OF status trigger — no INSERT case to worry about, and no
-- unsafe OLD access.
-- =============================================

-- Defensive: guarantee these columns exist regardless of whether migration
-- 016 has been applied to this database yet (harmless no-op if they do).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS slot_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slot_end   TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.sync_booking_confirmation_to_scribe()
RETURNS TRIGGER AS $$
DECLARE
  v_doctor_user_id        UUID;
  v_patient                public.booking_patients%ROWTYPE;
  v_legacy_patient_id      UUID;
  v_legacy_appointment_id  UUID;
  v_duration_minutes       INTEGER;
BEGIN
  SELECT user_id INTO v_doctor_user_id
    FROM public.doctor_profiles
    WHERE id = NEW.doctor_id;

  IF v_doctor_user_id IS NULL THEN
    -- Doctor profile has no linked auth user (shouldn't happen in practice);
    -- nothing safe to sync into doctor_id-scoped legacy tables.
    RAISE WARNING 'sync_booking_confirmation_to_scribe: doctor_profiles % has no user_id, skipping sync for booking_appointment %', NEW.doctor_id, NEW.id;
    RETURN NEW;
  END IF;

  SELECT * INTO v_patient
    FROM public.booking_patients
    WHERE id = NEW.patient_id;

  -- ── Step 1: legacy public.patients ─────────────────────────────────
  IF v_patient.linked_patient_id IS NOT NULL THEN
    v_legacy_patient_id := v_patient.linked_patient_id;

    UPDATE public.patients
      SET name       = v_patient.name,
          age        = v_patient.age,
          gender     = v_patient.gender,
          phone      = COALESCE(v_patient.alternate_mobile, v_patient.whatsapp_number),
          status     = 'active',
          updated_at = NOW()
      WHERE id = v_legacy_patient_id;
  ELSE
    INSERT INTO public.patients (doctor_id, name, age, gender, phone, status)
    VALUES (
      v_doctor_user_id,
      v_patient.name,
      v_patient.age,
      v_patient.gender,
      COALESCE(v_patient.alternate_mobile, v_patient.whatsapp_number),
      'active'
    )
    RETURNING id INTO v_legacy_patient_id;

    UPDATE public.booking_patients
      SET linked_patient_id = v_legacy_patient_id
      WHERE id = v_patient.id;
  END IF;

  -- ── Step 2: legacy public.appointments ─────────────────────────────
  v_duration_minutes := GREATEST(1, ROUND(EXTRACT(EPOCH FROM (NEW.slot_end - NEW.slot_start)) / 60)::INTEGER);

  IF NEW.linked_appointment_id IS NOT NULL THEN
    v_legacy_appointment_id := NEW.linked_appointment_id;

    UPDATE public.appointments
      SET patient_id   = v_legacy_patient_id,
          patient_name = v_patient.name,
          date         = (NEW.slot_start AT TIME ZONE 'UTC')::date,
          time         = to_char(NEW.slot_start AT TIME ZONE 'UTC', 'HH24:MI'),
          slot_start   = NEW.slot_start,
          slot_end     = NEW.slot_end,
          duration     = v_duration_minutes,
          type         = INITCAP(NEW.visit_type),
          status       = 'scheduled',
          source       = NEW.source,
          updated_at   = NOW()
      WHERE id = v_legacy_appointment_id;
  ELSE
    INSERT INTO public.appointments (
      doctor_id, patient_id, patient_name, date, time,
      slot_start, slot_end, duration, type, status, source
    )
    VALUES (
      v_doctor_user_id,
      v_legacy_patient_id,
      v_patient.name,
      (NEW.slot_start AT TIME ZONE 'UTC')::date,
      to_char(NEW.slot_start AT TIME ZONE 'UTC', 'HH24:MI'),
      NEW.slot_start,
      NEW.slot_end,
      v_duration_minutes,
      INITCAP(NEW.visit_type),
      'scheduled',
      NEW.source
    )
    RETURNING id INTO v_legacy_appointment_id;

    UPDATE public.booking_appointments
      SET linked_appointment_id = v_legacy_appointment_id
      WHERE id = NEW.id;
  END IF;

  -- ── Step 3: let the doctor know a new booking is ready ─────────────
  INSERT INTO public.booking_notifications (clinic_id, doctor_id, type, title, message, metadata)
  VALUES (
    NEW.clinic_id,
    NEW.doctor_id,
    'booking_confirmed',
    'Booking confirmed: ' || v_patient.name,
    'Appointment on ' || to_char(NEW.slot_start, 'DD Mon, HH24:MI') || ' is ready to open in Scribe.',
    jsonb_build_object(
      'booking_appointment_id', NEW.id,
      'legacy_appointment_id', v_legacy_appointment_id,
      'legacy_patient_id', v_legacy_patient_id
    )
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;

-- SECURITY DEFINER is required here: this trigger writes to public.patients
-- and public.appointments, whose RLS policies check `auth.uid() = doctor_id`.
-- A receptionist/staff member confirming a payment is NOT auth.uid() =
-- doctor, so without SECURITY DEFINER the INSERT/UPDATE above would be
-- blocked by RLS. The function runs with the privileges of its owner
-- (the migration role), bypassing RLS by design — exactly like service_role
-- does elsewhere in this schema.

DROP TRIGGER IF EXISTS booking_appointments_sync_scribe ON public.booking_appointments;
CREATE TRIGGER booking_appointments_sync_scribe
  AFTER UPDATE OF status ON public.booking_appointments
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status IS DISTINCT FROM 'confirmed')
  EXECUTE FUNCTION public.sync_booking_confirmation_to_scribe();

-- NOTE: this trigger's own UPDATE statements (setting linked_patient_id /
-- linked_appointment_id) will cause booking_patients_bump_version and
-- booking_appointments_bump_version to fire an extra time on top of the
-- version bump from the original status UPDATE. This is expected — by the
-- time the outer UPDATE ... SET status = 'confirmed' statement returns, the
-- row already reflects its final version. Application code should always
-- re-read the row after confirming rather than assuming version = old + 1.
