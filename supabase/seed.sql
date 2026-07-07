-- =============================================
-- Local seed: WhatsApp appointment booking
-- Test doctor + patient for Dr. Ravikiran
-- =============================================

-- Login: ravikiran@nadiai.test / password123

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'authenticated',
  'authenticated',
  'ravikiran@nadiai.test',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Dr. Ravikiran"}',
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  jsonb_build_object(
    'sub', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'email', 'ravikiran@nadiai.test',
    'email_verified', true
  ),
  'email',
  'ravikiran@nadiai.test',
  NOW(),
  NOW(),
  NOW()
)
ON CONFLICT (provider, provider_id) DO NOTHING;

INSERT INTO public.doctor_profiles (
  id,
  user_id,
  email,
  full_name,
  specialization,
  clinic_name,
  consultation_duration,
  consultation_fee,
  working_hours_start,
  working_hours_end,
  onboarding_complete
) VALUES (
  'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'ravikiran@nadiai.test',
  'Dr. Ravikiran',
  'General Physician',
  'Dr. Ravikiran Clinic',
  15,
  500,
  '09:00',
  '18:00',
  TRUE
)
ON CONFLICT (user_id) DO NOTHING;

-- Test patient under Dr. Ravikiran (resolved via doctor_profiles)
INSERT INTO public.patients (doctor_id, whatsapp_number, name)
SELECT
  dp.id,
  '+919988776655',
  'Priya Sharma'
FROM public.doctor_profiles dp
WHERE dp.email = 'ravikiran@nadiai.test'
   OR dp.full_name ILIKE '%Ravikiran%'
ORDER BY dp.created_at
LIMIT 1
ON CONFLICT (doctor_id, whatsapp_number) DO NOTHING;
