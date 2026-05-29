-- Server-side scheduled Strava sync.
--
-- Fixes the architectural gap where Strava runs only synced when the
-- athlete opened the app — athletes who ran but didn't open Form & Pace
-- (or whose access token expired) left the coach blind.
--
-- Requires the strava-cron-sync edge function to be deployed, and these
-- two Vault secrets to exist:
--   project_url        e.g. https://<ref>.supabase.co
--   service_role_key   the project service-role key
--
-- The edge function guards itself by requiring the service-role key as
-- the bearer, so this is the only thing allowed to invoke it.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('strava-sync-all') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'strava-sync-all'
);

-- Every 3 hours. Strava access tokens last ~6h; a 3h cadence keeps them
-- refreshed and surfaces new runs within a few hours of upload.
SELECT cron.schedule(
  'strava-sync-all',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='project_url') || '/functions/v1/strava-cron-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key')
    ),
    body := jsonb_build_object('daysBack', 14),
    timeout_milliseconds := 120000
  );
  $$
);
