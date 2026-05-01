// Form & Pace — service worker for Web Push.
// Receives push events from our push-send edge function and renders a
// notification. Clicking the notification opens the URL in the payload
// (focusing an existing tab if open).

self.addEventListener("install", (event) => {
  // Activate immediately on first install / on updates so users don't get
  // stuck on a stale worker.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Form & Pace", body: event.data?.text() || "" };
  }
  const title = payload.title || "Form & Pace";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192.png",
    badge: payload.badge || "/icon-192.png",
    tag: payload.tag,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of all) {
      try {
        const u = new URL(client.url);
        if (u.origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      } catch {}
    }
    return self.clients.openWindow(url);
  })());
});
