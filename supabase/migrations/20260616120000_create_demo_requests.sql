CREATE TABLE demo_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  clinic_name text NOT NULL,
  specialization text NOT NULL,
  doctor_count text NOT NULL,
  challenge text,
  notes text,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE demo_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_demo_requests" ON demo_requests FOR INSERT
  TO anon WITH CHECK (true);

CREATE POLICY "select_demo_requests" ON demo_requests FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "update_demo_requests" ON demo_requests FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "delete_demo_requests" ON demo_requests FOR DELETE
  TO authenticated USING (true);
