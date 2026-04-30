// Pure Strava API helpers — no React state. Callers handle their own setState.
import { STRAVA_CLIENT_ID, stravaCall } from "./supabase.js";
import { extractStravaData } from "./helpers.js";

// Returns true if the current user has a connected Strava account.
export async function checkStravaConnection() {
  try {
    const d = await stravaCall("check");
    return d.connected === true;
  } catch {
    return false;
  }
}

// Redirects to Strava OAuth. Call before navigating away.
export function connectStrava() {
  const redirectUri = encodeURIComponent(window.location.origin);
  const scope = "read,activity:read";
  sessionStorage.setItem("strava_oauth_in_flight", "1");
  window.location.href = `https://www.strava.com/oauth/authorize?client_id=${STRAVA_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&approval_prompt=auto&scope=${scope}`;
}

// Fetches the last ~180 days of running activities. We need at least 4–6
// months feeding into PMC so CTL is fully warmed up by the time it reaches
// the visible 90-day window. The full 365-day back-fill happens server-side
// via the strava-sync-athlete edge function.
export async function fetchStravaActivities() {
  const after = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60;
  const data = await stravaCall("list", { per_page: 200, after });
  if (!Array.isArray(data)) return null;
  return data.filter(a => a.sport_type === "Run" || a.type === "Run");
}

// Fetches and extracts a single Strava activity by id. Returns null on failure.
export async function fetchStravaDetail(id) {
  const data = await stravaCall("get", { activity_id: id });
  if (data?.id) return extractStravaData(data);
  return null;
}
