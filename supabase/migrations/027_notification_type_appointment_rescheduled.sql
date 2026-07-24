-- Extend in-app notification_type for patient self-serve reschedules
-- (reminder Reschedule button → SlotSelectionService._attemptReschedule).

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'appointment_rescheduled';
