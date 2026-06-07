-- Create coach_plans table for storing athlete training plans
CREATE TABLE IF NOT EXISTS coach_plans (
  athlete_email text PRIMARY KEY,
  plan_json jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE coach_plans ENABLE ROW LEVEL SECURITY;

-- Athletes can read their own plan
CREATE POLICY "Athletes can read own plan"
  ON coach_plans
  FOR SELECT
  USING (athlete_email = auth.jwt() ->> 'email');

-- Coach can read and write all plans.
-- NOTE: superseded by supabase-rls-role-model-migration.sql, which replaces
-- this email check with a profiles.role='coach' check. Keep the coach's email
-- here only as the fresh-install baseline before that migration runs.
CREATE POLICY "Coaches can manage all plans"
  ON coach_plans
  FOR ALL
  USING (
    auth.jwt() ->> 'email' IN (
      'degitzachary@gmail.com'
    )
  );

-- Insert placeholder rows for existing athletes
INSERT INTO coach_plans (athlete_email, plan_json)
VALUES
  ('suzy0913@gmail.com', '[]'),
  ('z.degit@gmail.com', '[]')
ON CONFLICT (athlete_email) DO NOTHING;