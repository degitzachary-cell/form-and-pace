import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function getValidToken(supabase: any, email: string): Promise<string> {
  const { data: row, error } = await supabase
    .from("strava_tokens")
    .select("*")
    .eq("athlete_email", email)
    .single();

  if (error || !row) throw new Error("Strava not connected");

  const now = Math.floor(Date.now() / 1000);
  if (row.expires_at > now + 300) return row.access_token;

  // Refresh expired token
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
  // A failed refresh (revoked token, Strava error) returns no access_token.
  // Persisting it would overwrite the row with nulls and break all future
  // refreshes, so bail out and surface the error instead.
  if (!refreshed?.access_token || !refreshed?.refresh_token) {
    throw new Error(`Strava token refresh failed: ${JSON.stringify(refreshed)}`);
  }
  await supabase.from("strava_tokens").upsert({
    athlete_email: email,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    expires_at: refreshed.expires_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: "athlete_email" });

  return refreshed.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, activity_id, per_page = 15, after } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user?.email) throw new Error("Not authenticated");

    // Just check if connected
    if (action === "check") {
      const { data } = await supabase
        .from("strava_tokens")
        .select("strava_athlete_id")
        .eq("athlete_email", user.email)
        .single();
      return new Response(JSON.stringify({ connected: !!data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getValidToken(supabase, user.email);

    // List: honour the caller's `after` window (epoch seconds) and page through
    // it — Strava caps a page at per_page, so a single fetch silently truncated
    // the history the client asked for (and dropped `after` entirely before).
    if (action === "list") {
      const afterParam = after ? `&after=${after}` : "";
      const all: any[] = [];
      for (let page = 1; page <= 10; page++) {
        const res = await fetch(
          `https://www.strava.com/api/v3/athlete/activities?per_page=${per_page}${afterParam}&page=${page}`,
          { headers: { "Authorization": `Bearer ${accessToken}` } },
        );
        if (!res.ok) {
          // Surface a structured error on the first page (client treats any
          // non-array as "no data"); on a later page keep what we have.
          if (page === 1) {
            return new Response(JSON.stringify({ error: `Strava list failed: ${res.status}`, status: res.status }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          break;
        }
        const batch = await res.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        all.push(...batch);
        if (batch.length < per_page) break;
      }
      return new Response(JSON.stringify(all), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get") {
      const stravaRes = await fetch(
        `https://www.strava.com/api/v3/activities/${activity_id}?include_all_efforts=false`,
        { headers: { "Authorization": `Bearer ${accessToken}` } },
      );
      const data = await stravaRes.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Unknown action");
  } catch (err) {
    const notConnected = err.message === "Strava not connected";
    return new Response(JSON.stringify({ error: err.message }), {
      status: notConnected ? 401 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
