-- Run this in your Supabase SQL editor
-- Go to: supabase.com → your project → SQL Editor → New Query

-- 1. Create profiles table
CREATE TABLE profiles (
  email       text PRIMARY KEY,
  role        text NOT NULL DEFAULT 'athlete',  -- 'athlete' | 'coach'
  name        text,
  avatar      text,
  goal        text,
  current_pb  text,
  created_at  timestamptz DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 3. All authenticated users can read profiles
--    (names and race goals are not sensitive on a coaching platform)
CREATE POLICY "Authenticated users can read profiles"
  ON profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 4. Only service role / Supabase dashboard can insert/update profiles
--    Add athletes and change roles via the Supabase table editor.
--    This prevents athletes from promoting themselves to coach.

-- 5. Seed existing athletes and coach
--    Update these rows via the Supabase table editor as needed.
INSERT INTO profiles (email, role, name, avatar, goal, current_pb) VALUES
  ('degitzachary@gmail.com', 'coach',   'Zachary Degit',   'ZD', NULL,       NULL),
  ('suzy0913@gmail.com',     'athlete', 'Siouxsie Sioux',  'SS', '1:50 HM',  '1:55'),
  ('z.degit@gmail.com',      'athlete', 'Zachary Degit',   'ZD', '1:50 HM',  '1:55')
ON CONFLICT (email) DO NOTHING;

-- ─── HOW TO ADD A NEW ATHLETE ──────────────────────────────────────────────────
-- 1. Go to Supabase → Table Editor → profiles → Insert row
--    Fill in: email, role='athlete', name, avatar (2-letter initials), goal, current_pb
-- 2. Add their training weeks to ATHLETE_PROGRAMS in App.jsx (still code for now)
--
-- ─── HOW TO ADD A COACH ───────────────────────────────────────────────────────
-- 1. Go to Supabase → Table Editor → profiles → Insert row
--    Fill in: email, role='coach', name
--    No code deploy needed.
