-- Server-side scheduled Strava sync.
--
-- Fixes the architectural gap where Strava runs only synced when the
-- athlete opened the app — athletes who ran but didn't open Form & Pace
-- (or whose access token expired) left the coach blind.
--
-- Requires the strava-cron-sync edge function to be deployed (verify_jwt
-- off). It self-guards with a shared secret (x-cron-secret header). The
-- secret is set as the CRON_SECRET edge-function env var (Supabase →
-- Edge Functions → Secrets) — never committed to source or the client
-- bundle. Put the SAME value in the header below. To rotate: update the
-- CRON_SECRET secret, redeploy the function, and update the header value.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('strava-sync-all') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'strava-sync-all'
);

-- Every 3 hours. Strava access tokens last ~6h; a 3h cadence keeps them
-- refreshed and surfaces new runs within a few hours of upload, with no
-- app-open required.
SELECT cron.schedule(
  'strava-sync-all',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://lsrxqviwgqjpuzzcqcpu.supabase.co/functions/v1/strava-cron-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', '<value of the CRON_SECRET edge-function secret>'
    ),
    body := jsonb_build_object('daysBack', 14),
    timeout_milliseconds := 150000
  );
  $$
);
