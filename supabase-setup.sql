-- Run this in your Supabase SQL editor to set up the database
-- Go to: supabase.com → your project → SQL Editor → New Query

-- 1. Create the session logs table
CREATE TABLE session_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id      text UNIQUE NOT NULL,
  athlete_email   text NOT NULL,
  athlete_name    text,
  feedback        text,
  analysis        jsonb,
  coach_reply     text,
  updated_at      timestamptz DEFAULT now()
);

-- 2. Enable Row Level Security
ALTER TABLE session_logs ENABLE ROW LEVEL SECURITY;

-- 3. Athletes can only read/write their own logs
CREATE POLICY "Athletes can manage own logs"
  ON session_logs
  FOR ALL
  USING (athlete_email = auth.jwt() ->> 'email')
  WITH CHECK (athlete_email = auth.jwt() ->> 'email');

-- 4. Coach emails can read ALL logs (add your coach emails here)
CREATE POLICY "Coaches can read all logs"
  ON session_logs
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN (
      'degitzachary@gmail.com'
    )
  );

-- 5. Coaches can update (for replies) all logs
CREATE POLICY "Coaches can update all logs"
  ON session_logs
  FOR UPDATE
  USING (
    auth.jwt() ->> 'email' IN (
      'degitzachary@gmail.com'
    )
  );
