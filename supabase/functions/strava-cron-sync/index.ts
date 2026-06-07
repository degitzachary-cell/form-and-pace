// Server-side scheduled Strava sync for ALL connected athletes.
//
// Why this exists: the client-side auto-sync (App.jsx) only runs when an
// athlete opens the app. Athletes who run but don't open Form & Pace —
// or whose access token has expired — never get their runs pulled, so the
// coach is blind. This function runs on a pg_cron schedule (and can be
// invoked manually) to refresh every athlete's token and pull recent
// activities regardless of whether anyone opened the app.
//
// Auth: NOT a user-JWT function. Guarded by a shared secret (CRON_SECRET)
// read from the function's environment (Supabase → Edge Functions →
// Secrets) and matched against the pg_cron job's x-cron-secret header —
// never committed to source or shipped in the client bundle. verify_jwt is
// disabled at deploy time precisely so this custom guard is the gate.
// Rotate by changing the CRON_SECRET secret + the cron job, then redeploying.
// Fails closed: if CRON_SECRET is unset, every request is rejected.
//
// Body (optional): { daysBack?: number }  — defaults to 30.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRAVA_PAGE_SIZE = 200;

// Shared secret — gate for cron/manual invocation. Sourced from the
// function environment; matched against the cron job's x-cron-secret header.
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function normaliseSportType(sportType?: string, fallbackType?: string): string {
  const s = String(sportType || fallbackType || "").toLowerCase();
  if (s === "run" || s === "trailrun" || s === "virtualrun") return "Run";
  if (s === "ride" || s === "virtualride" || s === "ebikeride" || s === "mountainbikeride" || s === "gravelride" || s === "handcycle" || s === "velomobile") return "Ride";
  if (s === "swim") return "Swim";
  if (s === "walk") return "Walk";
  if (s === "hike") return "Hike";
  if (s === "weighttraining") return "Strength";
  if (s === "workout" || s === "crossfit" || s === "hiit") return "Workout";
  if (s === "yoga" || s === "pilates") return "Mobility";
  if (s === "rowing" || s === "virtualrow") return "Row";
  if (!sportType) return "Other";
  return sportType.charAt(0).toUpperCase() + sportType.slice(1);
}

// Refresh the athlete's access token when it's within 5 min of expiry.
// CRITICAL: Strava rotates refresh tokens — persist the new one each time
// or the next refresh fails permanently.
async function getValidToken(supabase: any, row: any): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at > now + 300) return row.access_token;

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("STRAVA_CLIENT_ID"),
      client_secret: Deno.env.get("STRAVA_CLIENT_SECRET"),
      refresh_token: row.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshed = await res.json();
  if (!refreshed?.access_token) return null;

  await supabase.from("strava_tokens").upsert({
    athlete_email: row.athlete_email,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: "athlete_email" });

  return refreshed.access_token;
}

async function fetchActivities(accessToken: string, afterEpoch: number) {
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=${STRAVA_PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Strava list ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < STRAVA_PAGE_SIZE) break;
  }
  return all;
}

async function syncOne(supabase: any, tokenRow: any, daysBack: number) {
  const email = tokenRow.athlete_email;
  const result: any = { email, refreshed: false, fetched: 0, inserted: 0, error: null };
  try {
    const wasExpired = tokenRow.expires_at <= Math.floor(Date.now() / 1000) + 300;
    const accessToken = await getValidToken(supabase, tokenRow);
    if (!accessToken) { result.error = "token refresh failed"; return result; }
    result.refreshed = wasExpired;

    const afterEpoch = Math.floor(Date.now() / 1000) - daysBack * 86400;
    const acts = await fetchActivities(accessToken, afterEpoch);
    result.fetched = acts.length;

    const { data: profileRow } = await supabase
      .from("profiles").select("name").eq("email", email).maybeSingle();
    const athleteName = profileRow?.name || email;

    // Suppress an auto-sync row only against UNTAGGED manual/session rows
    // (no strava id) that might be the same run — runs with a strava id
    // are deduped by the unique index. Consume-once so doubles survive.
    const sinceDate = new Date(Date.now() - daysBack * 86400000).toISOString().slice(0, 10);
    const { data: existing } = await supabase
      .from("activities")
      .select("strava_data, activity_date, activity_type, distance_km")
      .eq("athlete_email", email)
      .gte("activity_date", sinceDate);
    const untagged = (existing || [])
      .filter((r: any) => !r.strava_data?.id && parseFloat(r.distance_km))
      .map((r: any) => ({ date: r.activity_date, type: r.activity_type || "Run", km: parseFloat(r.distance_km), used: false }));
    const claimsUntagged = (date: string, type: string, distKm: number) => {
      const m = untagged.find((u: any) => !u.used && u.date === date && u.type === type
        && Math.abs(u.km - distKm) / Math.max(u.km, distKm) < 0.1);
      if (m) { m.used = true; return true; }
      return false;
    };

    const rows = acts.map((a: any) => {
      const date = a.start_date_local?.split("T")[0];
      const durSec = a.moving_time || null;
      if (!date || !durSec) return null;
      const distKm = a.distance ? +(a.distance / 1000).toFixed(2) : null;
      const activityType = normaliseSportType(a.sport_type, a.type);
      if (date && distKm && claimsUntagged(date, activityType, distKm)) return null;
      return {
        athlete_email: email,
        athlete_name: athleteName,
        activity_date: date,
        distance_km: distKm,
        duration_seconds: durSec,
        activity_type: activityType,
        source: "strava-auto",
        strava_data: {
          id: a.id, name: a.name,
          start_date_local: a.start_date_local,
          distance: a.distance, moving_time: a.moving_time,
          elapsed_time: a.elapsed_time,
          total_elevation_gain: a.total_elevation_gain,
          average_speed: a.average_speed,
          average_heartrate: a.average_heartrate,
          max_heartrate: a.max_heartrate,
          sport_type: a.sport_type,
        },
      };
    }).filter(Boolean);

    // upsert + ignoreDuplicates leans on the partial UNIQUE index
    // (athlete_email, strava_activity_id) so re-syncs are no-ops.
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error, count } = await supabase
        .from("activities")
        .upsert(chunk, { onConflict: "athlete_email,strava_activity_id", ignoreDuplicates: true })
        .select("id", { count: "exact" });
      if (error) throw new Error(error.message);
      result.inserted += count ?? 0;
    }
  } catch (e) {
    result.error = (e as Error).message;
  }
  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    // Guard: caller must present the shared secret (header or body).
    let body: any = {};
    try { body = await req.json(); } catch (_) { /* no body */ }
    const provided = req.headers.get("x-cron-secret") || body?.secret || "";
    // Fail closed: an unset CRON_SECRET must never authorise a request.
    if (!CRON_SECRET || provided !== CRON_SECRET) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const daysBack = body?.daysBack ? Number(body.daysBack) : 30;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: tokens, error } = await supabase.from("strava_tokens").select("*");
    if (error) throw new Error(error.message);

    const results = [];
    for (const t of tokens || []) {
      results.push(await syncOne(supabase, t, daysBack));
    }

    return new Response(JSON.stringify({
      ranAt: new Date().toISOString(),
      athletes: results.length,
      totalInserted: results.reduce((n, r) => n + (r.inserted || 0), 0),
      refreshed: results.filter(r => r.refreshed).length,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
