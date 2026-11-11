// Admin PWA service worker (docs/PROJECT_SPEC.md §8.2 "Admin PWA", §16 M11).
// Push + notification-click ONLY. Deliberately no fetch handler and no
// caches: this app shows customer phone numbers, order data and staff
// sessions, so nothing authenticated may ever be served from an offline
// cache. "Installable" needs only the manifest and a registered worker.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Update", body: "" };
  try {
    payload = event.data ? event.data.json() : payload;
  } catch {
    payload = { title: "Update", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || "/" },
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.url || undefined,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
