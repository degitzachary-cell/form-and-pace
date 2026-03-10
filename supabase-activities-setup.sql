-- Run this in your Supabase SQL editor
-- Go to: supabase.com → your project → SQL Editor → New Query

-- 1. Create the activities table (manual + future Strava-synced runs)
CREATE TABLE activities (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_email   text NOT NULL,
  athlete_name    text,
  activity_date   date NOT NULL,
  distance_km     numeric(6,2) NOT NULL,
  duration_seconds integer,
  activity_type   text DEFAULT 'Run',
  notes           text,
  source          text DEFAULT 'manual',  -- 'manual' or 'strava'
  created_at      timestamptz DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- 3. Athletes can manage their own activities
CREATE POLICY "Athletes can manage own activities"
  ON activities
  FOR ALL
  USING (athlete_email = auth.jwt() ->> 'email')
  WITH CHECK (athlete_email = auth.jwt() ->> 'email');

-- 4. Coaches can read all activities
CREATE POLICY "Coaches can read all activities"
  ON activities
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN (
      'degitzachary@gmail.com'
    )
  );
