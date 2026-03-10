-- Migration: Add strava_data column to session_logs and activities tables
-- Run this in your Supabase SQL editor
-- Go to: supabase.com → your project → SQL Editor → New Query

-- 1. Add strava_data to session_logs (stores full Strava activity detail for scheduled sessions)
ALTER TABLE session_logs
  ADD COLUMN IF NOT EXISTS strava_data jsonb;

-- 2. Add strava_data to activities (stores full Strava activity detail for extra/manual runs)
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS strava_data jsonb;
