import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const STRAVA_CLIENT_ID  = import.meta.env.VITE_STRAVA_CLIENT_ID;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

export async function stravaCall(action, extra = {}) {
  const token = await getAuthToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ action, ...extra }),
  });
  return res.json();
}

export async function exchangeStravaCode(code) {
  const token = await getAuthToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ code }),
  });
  return res.json();
}

// Coach-only: server-side back-fill of an athlete's last `daysBack` of Strava
// runs into the activities table. Uses the athlete's stored token; coach
// doesn't need their own Strava connection.
export async function syncAthleteStrava(athleteEmail, daysBack = 365) {
  const token = await getAuthToken();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/strava-sync-athlete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: JSON.stringify({ athleteEmail, daysBack }),
  });
  return res.json();
}
