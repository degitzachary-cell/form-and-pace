-- Add an `exercises` column to workout_templates so saving a strength
-- workout as a template round-trips correctly. Previously the save payload
-- only included `steps`, so applying a template silently dropped the
-- exercise list (sets / reps / load).
ALTER TABLE workout_templates
  ADD COLUMN IF NOT EXISTS exercises jsonb;
