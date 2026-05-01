import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Load VAPID credentials from vault via RPC helper.
    const [pubRes, privRes, subjRes] = await Promise.all([
      supabase.rpc("get_vault_secret", { secret_name: "VAPID_PUBLIC" }),
      supabase.rpc("get_vault_secret", { secret_name: "VAPID_PRIVATE" }),
      supabase.rpc("get_vault_secret", { secret_name: "VAPID_SUBJECT" }),
    ]);
    const VAPID_PUBLIC  = Deno.env.get("VAPID_PUBLIC")  || pubRes.data;
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE") || privRes.data;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || subjRes.data;
    if (!VAPID_PUBLIC || !VAPID_PRIVATE || !VAPID_SUBJECT) {
      throw new Error("VAPID credentials not configured");
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const { data: { user } } = await supabase.auth.getUser(jwt);
    if (!user?.email) throw new Error("Not authenticated");

    const { recipientEmails, title, body = "", url = "/", tag } = await req.json();
    if (!Array.isArray(recipientEmails) || !recipientEmails.length) throw new Error("recipientEmails required");
    if (!title) throw new Error("title required");

    const { data: callerProfile } = await supabase
      .from("profiles").select("role").eq("email", user.email.toLowerCase()).single();
    const callerEmail = user.email.toLowerCase();
    const targets = recipientEmails.map((e: string) => String(e).toLowerCase());
    if (callerProfile?.role !== "coach" && targets.some((t: string) => t !== callerEmail)) {
      throw new Error("Athletes can only notify themselves");
    }

    const { data: subs, error: subErr } = await supabase
      .from("push_subscriptions").select("*").in("user_email", targets);
    if (subErr) throw subErr;
    if (!subs?.length) {
      return new Response(JSON.stringify({ sent: 0, message: "no subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({ title, body, url, tag });
    let sent = 0;
    const stale: string[] = [];
    for (const s of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 },
        );
        sent++;
      } catch (err: any) {
        const code = err?.statusCode || err?.status;
        if (code === 404 || code === 410) stale.push(s.endpoint);
        else console.error("push send error:", err);
      }
    }
    if (stale.length) await supabase.from("push_subscriptions").delete().in("endpoint", stale);

    return new Response(JSON.stringify({ sent, dropped: stale.length, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
