// Coach-triggered Strava back-fill for any athlete on the roster.
// Reads the athlete's stored token, refreshes if expired, pages through up to
// 365 days of run activities, then upserts rows into the activities table
// with source="strava-auto". Returns counts so the coach UI can confirm.
//
// Auth: caller must be authenticated AND have role="coach" in their profile.
// Body: { athleteEmail: string, daysBack?: number }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STRAVA_PAGE_SIZE = 200;

async function getValidToken(supabase: any, email: string): Promise<string> {
  const { data: row, error } = await supabase
    .from("strava_tokens")
    .select("*")
    .eq("athlete_email", email)
    .single();
  if (error || !row) throw new Error(`Strava not connected for ${email}`);

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
  if (!refreshed?.access_token) throw new Error("Strava token refresh failed");

  await supabase.from("strava_tokens").upsert({
    athlete_email: email,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: "athlete_email" });

  return refreshed.access_token;
}

async function fetchAllStravaRuns(accessToken: string, afterEpoch: number) {
  const all: any[] = [];
  for (let page = 1; page <= 10; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${afterEpoch}&per_page=${STRAVA_PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, { headers: { "Authorization": `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`Strava list failed: ${res.status}`);
    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < STRAVA_PAGE_SIZE) break;
  }
  return all.filter(a => a.sport_type === "Run" || a.type === "Run");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { athleteEmail, daysBack = 365 } = await req.json();
    if (!athleteEmail) throw new Error("athleteEmail required");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Verify caller is a coach
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user?.email) throw new Error("Not authenticated");
    const { data: callerProfile } = await supabase
      .from("profiles").select("role").eq("email", user.email.toLowerCase()).single();
    if (callerProfile?.role !== "coach") throw new Error("Coach role required");

    const targetEmail = String(athleteEmail).toLowerCase();
    const accessToken = await getValidToken(supabase, targetEmail);
    const afterEpoch = Math.floor(Date.now() / 1000) - daysBack * 24 * 60 * 60;
    const runs = await fetchAllStravaRuns(accessToken, afterEpoch);

    // Look up athlete name + already-synced strava IDs
    const { data: profileRow } = await supabase
      .from("profiles").select("name").eq("email", targetEmail).single();
    const athleteName = profileRow?.name || targetEmail;

    const { data: existing } = await supabase
      .from("activities")
      .select("strava_data")
      .eq("athlete_email", targetEmail);
    const existingIds = new Set(
      (existing || []).map((r: any) => r.strava_data?.id).filter(Boolean),
    );

    const rows = runs
      .filter(a => !existingIds.has(a.id))
      .map(a => {
        const date = a.start_date_local?.split("T")[0];
        const distKm = a.distance ? +(a.distance / 1000).toFixed(2) : null;
        const durSec = a.moving_time || null;
        if (!date || !distKm || !durSec) return null;
        return {
          athlete_email: targetEmail,
          athlete_name: athleteName,
          activity_date: date,
          distance_km: distKm,
          duration_seconds: durSec,
          activity_type: "Run",
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
      })
      .filter(Boolean);

    let inserted = 0;
    if (rows.length) {
      // Insert in chunks to avoid request size limits.
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const { error, count } = await supabase
          .from("activities").insert(chunk).select("id", { count: "exact" });
        if (error) throw new Error(`Insert failed: ${error.message}`);
        inserted += count ?? chunk.length;
      }
    }

    return new Response(JSON.stringify({
      athleteEmail: targetEmail,
      fetched: runs.length,
      alreadySynced: runs.length - rows.length,
      inserted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
