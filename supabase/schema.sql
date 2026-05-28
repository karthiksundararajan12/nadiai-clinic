-- =============================================
-- Nadi AI - Complete Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- Doctor Profiles table for onboarding and user data
CREATE TABLE IF NOT EXISTS public.doctor_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT NOT NULL,
  specialization TEXT,
  license_number TEXT,
  phone TEXT,
  clinic_name TEXT,
  clinic_address TEXT,
  consultation_duration INTEGER DEFAULT 30,
  consultation_fee DECIMAL(10,2) DEFAULT 500,
  working_hours_start TEXT DEFAULT '09:00',
  working_hours_end TEXT DEFAULT '18:00',
  whatsapp_phone_number_id TEXT,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT doctor_profiles_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
  ON public.doctor_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.doctor_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.doctor_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Clinics table (WhatsApp entry point per clinic)
CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  whatsapp_phone_number_id TEXT,
  whatsapp_provider TEXT DEFAULT 'meta',
  whatsapp_display_number TEXT,
  whatsapp_business_account_id TEXT,
  meta_business_id TEXT,
  whatsapp_access_token_encrypted TEXT,
  whatsapp_setup_status TEXT DEFAULT 'pending_verification',
  whatsapp_setup_requested_at TIMESTAMPTZ,
  whatsapp_verified_at TIMESTAMPTZ,
  whatsapp_setup_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS whatsapp_provider TEXT DEFAULT 'meta',
  ADD COLUMN IF NOT EXISTS whatsapp_display_number TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business_account_id TEXT,
  ADD COLUMN IF NOT EXISTS meta_business_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_setup_status TEXT DEFAULT 'pending_verification',
  ADD COLUMN IF NOT EXISTS whatsapp_setup_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS whatsapp_setup_error TEXT;

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

-- Allow doctors to see their clinic (via doctor_profiles.clinic_id)
DROP POLICY IF EXISTS "Doctors can view their clinic" ON public.clinics;
CREATE POLICY "Doctors can view their clinic"
  ON public.clinics FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.doctor_profiles dp
      WHERE dp.user_id = auth.uid()
      AND dp.clinic_id = clinics.id
    )
  );

-- Link each doctor to a clinic
ALTER TABLE public.doctor_profiles
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- Patients table
CREATE TABLE IF NOT EXISTS public.patients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  age INTEGER,
  gender TEXT,
  phone TEXT,
  email TEXT,
  condition TEXT,
  status TEXT DEFAULT 'active',
  last_visit DATE,
  next_appointment DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own patients"
  ON public.patients FOR ALL
  USING (auth.uid() = doctor_id);

-- Appointments table
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  duration INTEGER DEFAULT 30,
  type TEXT DEFAULT 'Consultation',
  status TEXT DEFAULT 'scheduled',
  notes TEXT,
  source TEXT DEFAULT 'direct',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own appointments"
  ON public.appointments FOR ALL
  USING (auth.uid() = doctor_id);

-- Scribe sessions table
CREATE TABLE IF NOT EXISTS public.scribe_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  language TEXT DEFAULT 'hinglish',
  transcription JSONB DEFAULT '[]',
  clinical_note TEXT,
  duration INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.scribe_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own scribe sessions"
  ON public.scribe_sessions FOR ALL
  USING (auth.uid() = doctor_id);

-- =============================================
-- WhatsApp Bot Tables
-- =============================================

-- WhatsApp Conversations (bot state machine)
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  patient_name TEXT,
  patient_age INTEGER,
  patient_gender TEXT,
  state TEXT DEFAULT 'WELCOME',
  selected_slot JSONB,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  payment_id UUID,
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own wa conversations"
  ON public.whatsapp_conversations FOR ALL
  USING (auth.uid() = doctor_id);

-- Ensure doctor_id can be null until patient chooses a doctor
ALTER TABLE public.whatsapp_conversations
  ALTER COLUMN doctor_id DROP NOT NULL;

-- Ensure clinic_id exists for multi-doctor clinics
ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE;

-- WhatsApp Messages
CREATE TABLE IF NOT EXISTS public.wa_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  doctor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors can manage their own wa messages" ON public.wa_messages;
CREATE POLICY "Doctors can manage their own wa messages"
  ON public.wa_messages FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.whatsapp_conversations c
      WHERE c.id = wa_messages.conversation_id
      AND c.doctor_id = auth.uid()
    )
  );

-- Ensure messages are readable even before wa_messages.doctor_id is set
ALTER TABLE public.wa_messages
  ALTER COLUMN doctor_id DROP NOT NULL;

-- Payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  patient_phone TEXT,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  payment_mode TEXT,
  payment_link TEXT,
  transaction_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own payments"
  ON public.payments FOR ALL
  USING (auth.uid() = doctor_id);

-- Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  invoice_number TEXT NOT NULL,
  clinic_name TEXT NOT NULL,
  doctor_name TEXT NOT NULL,
  patient_name TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  payment_mode TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own invoices"
  ON public.invoices FOR ALL
  USING (auth.uid() = doctor_id);

-- Doctor Notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own notifications"
  ON public.notifications FOR ALL
  USING (auth.uid() = doctor_id);

-- Appointment Slots Configuration
CREATE TABLE IF NOT EXISTS public.appointment_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.appointment_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Doctors can manage their own slots"
  ON public.appointment_slots FOR ALL
  USING (auth.uid() = doctor_id);
