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
  working_hours_start TEXT DEFAULT '09:00',
  working_hours_end TEXT DEFAULT '18:00',
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT doctor_profiles_user_id_key UNIQUE (user_id)
);

ALTER TABLE public.doctor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile"
  ON public.doctor_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
  ON public.doctor_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.doctor_profiles
  FOR UPDATE
  USING (auth.uid() = user_id);

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
  ON public.patients
  FOR ALL
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
  ON public.appointments
  FOR ALL
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
  ON public.scribe_sessions
  FOR ALL
  USING (auth.uid() = doctor_id);
