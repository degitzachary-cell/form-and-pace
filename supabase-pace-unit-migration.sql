-- Per-athlete display preference for paces and distances. Stored as
-- "km" (default) or "mi". All math (rTSS, threshold pace, zones,
-- Strava distances) stays in km internally — this only affects what
-- the athlete sees on screen.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pace_unit text DEFAULT 'km' CHECK (pace_unit IN ('km', 'mi'));
