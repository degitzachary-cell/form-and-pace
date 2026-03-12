-- Migration: Fix coach RLS policies
-- Run this in your Supabase SQL editor
-- Go to: supabase.com → your project → SQL Editor → New Query

-- 1. Allow coaches to INSERT into session_logs
--    Needed when athlete logged via "Log Activity" (no session_log row exists yet)
--    and coach sends the first reply — creates the log with the athlete's email.
CREATE POLICY "Coaches can insert session logs"
  ON session_logs FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'email' IN ('degitzachary@gmail.com')
  );

-- 2. Allow coaches to UPDATE activities
--    Needed for saving coach_reply on extra/manual runs.
CREATE POLICY "Coaches can update activities"
  ON activities FOR UPDATE
  USING (
    auth.jwt() ->> 'email' IN ('degitzachary@gmail.com')
  );
