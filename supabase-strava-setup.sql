-- Run this in Supabase SQL Editor after the main supabase-setup.sql

-- 1. Strava tokens table (one row per athlete)
CREATE TABLE strava_tokens (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  athlete_email    text UNIQUE NOT NULL,
  access_token     text NOT NULL,
  refresh_token    text NOT NULL,
  expires_at       bigint NOT NULL,
  strava_athlete_id bigint,
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE strava_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own strava tokens"
  ON strava_tokens FOR ALL
  USING (athlete_email = auth.jwt() ->> 'email')
  WITH CHECK (athlete_email = auth.jwt() ->> 'email');

CREATE POLICY "Coaches read strava tokens"
  ON strava_tokens FOR SELECT
  USING (auth.jwt() ->> 'email' IN ('degitzachary@gmail.com'));

-- 2. Add strava_data column to session_logs
ALTER TABLE session_logs ADD COLUMN IF NOT EXISTS strava_data jsonb;
