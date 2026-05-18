-- Deduplicates strava-sourced activity rows and adds a unique index
-- so future concurrent auto-syncs can't race-double-insert the same
-- Strava activity. The race was producing "2 × 21km" type artefacts
-- on the athlete's day view.
--
-- Step 1: delete duplicates (keep the older row).
-- Step 2: add a stored generated column for strava_data->>'id' so
--         Supabase upsert's onConflict can target it by name.
-- Step 3: partial UNIQUE index on (athlete_email, strava_activity_id).
--         Partial so manual activities (no strava_data) aren't blocked.

DELETE FROM activities
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           row_number() OVER (
             PARTITION BY athlete_email, strava_data->>'id'
             ORDER BY created_at ASC
           ) AS rn
    FROM activities
    WHERE strava_data->>'id' IS NOT NULL
  ) ranked
  WHERE rn > 1
);

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS strava_activity_id text
  GENERATED ALWAYS AS (strava_data->>'id') STORED;

CREATE UNIQUE INDEX IF NOT EXISTS activities_unique_strava_per_athlete
  ON activities (athlete_email, strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;
