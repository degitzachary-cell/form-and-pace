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

// Fetches last ~10 weeks of running activities.
// Returns a filtered array, or null if the API returned a non-array response
// (so callers can preserve their existing state instead of clearing it).
export async function fetchStravaActivities() {
  const after = Math.floor(Date.now() / 1000) - 10 * 7 * 24 * 60 * 60;
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
