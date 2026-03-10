-- Run this in your Supabase SQL editor after supabase-setup.sql
-- Go to: supabase.com → your project → SQL Editor → New Query

-- 1. Create the monthly_summaries table
CREATE TABLE monthly_summaries (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_email  text NOT NULL,
  block_start    text NOT NULL,       -- e.g. "2026-03-09" (first weekStart of the block)
  summary        jsonb NOT NULL,      -- { headline, wins, watchPoints, nextBlockFocus, volumeTrend }
  generated_at   timestamptz DEFAULT now(),
  UNIQUE (athlete_email, block_start)
);

-- 2. Enable Row Level Security
ALTER TABLE monthly_summaries ENABLE ROW LEVEL SECURITY;

-- 3. Athletes can read their own summaries
CREATE POLICY "Athletes can read own summaries"
  ON monthly_summaries
  FOR SELECT
  USING (athlete_email = auth.jwt() ->> 'email');

-- 4. Coach can read all summaries
CREATE POLICY "Coach can read all summaries"
  ON monthly_summaries
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' IN (
      'degitzachary@gmail.com'
    )
  );

-- 5. Coach can insert and update summaries
CREATE POLICY "Coach can write summaries"
  ON monthly_summaries
  FOR ALL
  USING (
    auth.jwt() ->> 'email' IN (
      'degitzachary@gmail.com'
    )
  )
  WITH CHECK (
    auth.jwt() ->> 'email' IN (
      'degitzachary@gmail.com'
    )
  );
