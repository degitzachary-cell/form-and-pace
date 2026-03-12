-- Migration: Add coach_reply column to activities table
-- Allows coaches to reply directly to an athlete's extra/manual runs
-- (Consistent with the coach_reply column on session_logs)
-- Run this in your Supabase SQL editor
-- Go to: supabase.com → your project → SQL Editor → New Query

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS coach_reply text;
