-- Enable Supabase realtime on the tables the coach + athlete views
-- subscribe to. Without this, postgres_changes events never fire and
-- the app feels like it requires a refresh whenever the other side
-- of the conversation logs a run / publishes a plan / drops a marker.
--
-- Idempotent: ADD TABLE errors if a table is already in the publication,
-- so we wrap each in a DO block that only adds when missing.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'session_logs'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE session_logs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'activities'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE activities';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'coach_plans'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE coach_plans';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'calendar_markers'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE calendar_markers';
  END IF;
END $$;
