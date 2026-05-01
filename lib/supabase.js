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

// Send a Web Push notification to one or more users. Server enforces:
// athletes can only notify themselves; coaches can notify anyone (the
// frontend should pass correct recipients). Fire-and-forget — don't await
// in critical paths; let it resolve in the background.
export async function sendPush({ recipientEmails, title, body, url, tag }) {
  try {
    const token = await getAuthToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ recipientEmails, title, body, url, tag }),
    });
    return res.json();
  } catch (e) {
    console.error("sendPush failed:", e);
    return { error: String(e) };
  }
}
