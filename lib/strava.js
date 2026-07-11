// Pure Strava API helpers — no React state. Callers handle their own setState.
import { STRAVA_CLIENT_ID, stravaCall } from "./supabase.js";
import { extractStravaData } from "./helpers.js";

// Maps Strava's sport_type field (40+ values) into the activity_type strings
// we use everywhere else. Run variants normalise to "Run", bike variants to
// "Ride", weight training to "Strength", and HIIT/Workout/Crossfit to a
// shared "Workout" bucket. Anything we don't recognise passes through as-is.
export function normaliseSportType(sportType, fallbackType) {
  const s = String(sportType || fallbackType || "").toLowerCase();
  if (s === "run" || s === "trailrun" || s === "virtualrun") return "Run";
  if (s === "ride" || s === "virtualride" || s === "ebikeride" || s === "mountainbikeride" || s === "gravelride" || s === "handcycle" || s === "velomobile") return "Ride";
  if (s === "swim") return "Swim";
  if (s === "walk") return "Walk";
  if (s === "hike") return "Hike";
  if (s === "weighttraining") return "Strength";
  if (s === "workout" || s === "crossfit" || s === "hiit" || s === "highintensityintervaltraining") return "Workout";
  if (s === "yoga" || s === "pilates") return "Mobility";
  if (s === "rowing" || s === "virtualrow") return "Row";
  // Pass-through with first letter uppercased for unknowns.
  if (!sportType) return "Other";
  return sportType.charAt(0).toUpperCase() + sportType.slice(1);
}

// True if this Strava activity is a run (any variant). PMC, rTSS, and weekly
// km totals only count run activities — other sports need their own load
// formulas.
export function isStravaRun(stravaActivity) {
  const t = stravaActivity?.sport_type || stravaActivity?.type;
  return t === "Run" || t === "TrailRun" || t === "VirtualRun";
}

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

// Translate a Strava HTTP status into something an athlete can act on.
// 403 "Application Inactive" took the whole pipeline down silently once —
// every failure here must surface, not degrade into an empty picker.
export function stravaErrorMessage(status) {
  if (status === 401) return "Strava connection expired — reconnect Strava and try again.";
  if (status === 403) return "Strava has blocked this app's access (app deactivated or rate-limited). Your coach needs to check the Strava API settings. You can still log the run manually.";
  if (status === 429) return "Strava rate limit reached — wait a few minutes and try again.";
  return `Strava error (${status || "network"}) — try again shortly, or log the run manually.`;
}

// Fetches the last ~180 days of activities — every sport type, not just runs.
// The 180-day window covers PMC's CTL warm-up. Coaches/athletes get the full
// 365 via the strava-sync-athlete edge function.
// Throws with a user-facing message when Strava refuses — callers show it.
export async function fetchStravaActivities() {
  const after = Math.floor(Date.now() / 1000) - 180 * 24 * 60 * 60;
  const data = await stravaCall("list", { per_page: 200, after });
  if (!Array.isArray(data)) {
    if (data && (data.error || data.status)) throw new Error(stravaErrorMessage(data.status));
    return null;
  }
  return data;
}

// Fetches and extracts a single Strava activity by id. Returns null when the
// activity genuinely has no data; THROWS with a user-facing message when
// Strava refuses (mirrors fetchStravaActivities — a swallowed refusal here
// meant tapping a run in the picker silently did nothing).
export async function fetchStravaDetail(id) {
  const data = await stravaCall("get", { activity_id: id });
  if (data?.id) return extractStravaData(data);
  if (data && (data.error || data.status)) throw new Error(stravaErrorMessage(data.status));
  return null;
}
