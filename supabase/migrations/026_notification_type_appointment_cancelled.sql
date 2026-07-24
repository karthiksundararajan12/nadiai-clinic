-- Extend in-app notification_type for patient WhatsApp cancellations.
-- Written best-effort by ConversationStateService after cancelViaPatientKeyword.

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'appointment_cancelled';
