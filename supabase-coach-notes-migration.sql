-- Migration: Add coach_notes column to activities table
-- Allows coaches to reply directly to an athlete's extra/manual runs
-- Run this in your Supabase SQL editor
-- Go to: supabase.com → your project → SQL Editor → New Query

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS coach_notes text;
