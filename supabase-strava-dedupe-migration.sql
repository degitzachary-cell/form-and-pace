-- Deduplicates strava-sourced activity rows and adds a unique index
-- so future concurrent auto-syncs can't race-double-insert the same
-- Strava activity. The race was producing "2 × 21km" type artefacts
-- on the athlete's day view.
--
-- Step 1: delete duplicates (keep the older row).
-- Step 2: add a stored generated column for strava_data->>'id' so
--         Supabase upsert's onConflict can target it by name.
-- Step 3: NON-partial UNIQUE index on (athlete_email, strava_activity_id).
--         A partial index can't serve as an ON CONFLICT arbiter for the
--         supabase-js upserts (which omit the WHERE predicate), so the sync
--         upserts failed with "no unique or exclusion constraint matching the
--         ON CONFLICT specification". A plain unique index works because
--         Postgres treats NULL strava_activity_id (manual rows) as distinct,
--         so they're still unconstrained.

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

DROP INDEX IF EXISTS activities_unique_strava_per_athlete;
CREATE UNIQUE INDEX IF NOT EXISTS activities_unique_strava_per_athlete
  ON activities (athlete_email, strava_activity_id);

-- activities now stores all Strava sport types; strength/workout activities
-- carry no distance, so distance_km can't be NOT NULL (one null-distance row
-- would otherwise abort the whole sync batch). The app reads it as `|| 0`.
ALTER TABLE activities ALTER COLUMN distance_km DROP NOT NULL;
ALTER TABLE activities ALTER COLUMN distance_km SET DEFAULT 0;
