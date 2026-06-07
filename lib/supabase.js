import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL      = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const STRAVA_CLIENT_ID  = import.meta.env.VITE_STRAVA_CLIENT_ID;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? "";
}

// Shared POST to a Supabase edge function. Always resolves to a parsed object;
// on a network error or non-2xx response it returns `{ error, status }` instead
// of throwing — so callers never hit an unhandled rejection, and a res.json()
// call never blows up on an HTML error/gateway page (which isn't valid JSON).
async function postFunction(path, payload) {
  try {
    const token = await getAuthToken();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON body (e.g. gateway error) */ }
    if (!res.ok) {
      console.error(`edge function ${path} → HTTP ${res.status}`, data);
      return { error: data?.error || `HTTP ${res.status}`, status: res.status, ...(data && typeof data === "object" ? data : {}) };
    }
    return data ?? {};
  } catch (e) {
    console.error(`edge function ${path} failed:`, e);
    return { error: String(e?.message || e) };
  }
}

export const stravaCall = (action, extra = {}) =>
  postFunction("strava-activities", { action, ...extra });

export const exchangeStravaCode = (code) =>
  postFunction("strava-auth", { code });

// Coach-only: server-side back-fill of an athlete's last `daysBack` of Strava
// runs into the activities table. Uses the athlete's stored token; coach
// doesn't need their own Strava connection.
export const syncAthleteStrava = (athleteEmail, daysBack = 365) =>
  postFunction("strava-sync-athlete", { athleteEmail, daysBack });

// Send a Web Push notification to one or more users. Server enforces:
// athletes can only notify themselves; coaches can notify anyone (the
// frontend should pass correct recipients). Fire-and-forget — don't await
// in critical paths; let it resolve in the background.
export const sendPush = ({ recipientEmails, title, body, url, tag }) =>
  postFunction("push-send", { recipientEmails, title, body, url, tag });
