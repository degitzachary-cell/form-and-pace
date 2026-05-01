// Web Push subscription helpers — registers the service worker, prompts for
// permission, and posts the resulting subscription to Supabase. Uses VAPID.
import { supabase } from "./supabase.js";

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC
  || "BNIQ8E9n99_3lb2VlgWh2qVgt-M6VcLXv7__-ZgnF8-vFr7odJVSSejsG2W-duodl51vS1UMS29h16yJfhq1FuM";

// Web Push wants the VAPID public key as a Uint8Array of raw bytes.
function urlB64ToUint8Array(base64) {
  const padding = "=".repeat((4 - base64.length % 4) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// True only when this browser supports the full Web Push pipeline. Service
// workers + Push API + Notifications API.
export function pushSupported() {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

// Returns "granted" | "denied" | "default" | "unsupported".
export function pushPermissionState() {
  if (!pushSupported()) return "unsupported";
  return Notification.permission;
}

async function getReg() {
  let reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

// Subscribes the current browser to push and stores the subscription on
// the server. Idempotent — re-subscribing for the same endpoint is a no-op.
// Returns { ok: true } on success, or { ok: false, reason } otherwise.
export async function enablePush(userEmail) {
  if (!pushSupported()) return { ok: false, reason: "unsupported" };
  if (!userEmail) return { ok: false, reason: "no-user" };

  const perm = await Notification.requestPermission();
  if (perm !== "granted") return { ok: false, reason: perm };

  const reg = await getReg();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
    });
  }
  const json = sub.toJSON();
  const ua = navigator.userAgent || "";
  const deviceLabel = /iPhone/.test(ua) ? "iPhone"
    : /Android/.test(ua) ? "Android"
    : /Mac/.test(ua) ? "Mac"
    : /Windows/.test(ua) ? "Windows"
    : "Browser";
  const { error } = await supabase.from("push_subscriptions").upsert({
    user_email: userEmail.toLowerCase(),
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    device_label: deviceLabel,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) return { ok: false, reason: "save-failed", error };
  return { ok: true };
}

// Unsubscribes this browser from push and removes the row from Supabase.
export async function disablePush() {
  if (!pushSupported()) return { ok: false };
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return { ok: true };
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return { ok: true };
  await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
  return { ok: true };
}

// True if this browser already has a registered, server-tracked subscription.
export async function isPushActive() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}
