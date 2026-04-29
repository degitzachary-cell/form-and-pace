-- Training-load (rTSS) migration.
--
-- Adds optional columns used by lib/load.js to compute and persist running
-- TSS, pace zones, and compliance grades. All columns are nullable — the app
-- treats missing values as "compute on the fly" or "unknown."
--
-- Apply order: schema changes are additive and idempotent (IF NOT EXISTS).

-- 1. Threshold pace on the athlete profile.
--
--    Stored as the same "M:SS" string format the user types into the profile
--    form (e.g. "4:35"). Parsed at runtime by lib/load.js / paceStrToSecsPerKm.
--    Falls back to PBs when null.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS threshold_pace text;

-- 2. rTSS persisted on each manually-tracked activity.
--
--    Edge functions / sync workers can write here; UI computes on the fly
--    if null. We don't enforce non-null because old rows pre-date this column.
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS rtss numeric;
