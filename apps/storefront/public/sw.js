// Storefront PWA service worker (docs/PROJECT_SPEC.md §16 M10).
// Deliberately minimal: a navigation-fallback cache (so a repeat visit
// still renders an app shell offline) plus Web Push handling. No
// aggressive asset caching — this is a free-tier/no-CDN-build-step
// project (golden rule 8), and Next's own HTTP caching already handles
// static asset freshness; duplicating that here would just risk serving
// stale bundles after a deploy.
const SHELL_CACHE = "shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))),
  );
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
      data: { url: payload.url ?? "/" },
      icon: "/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(self.clients.openWindow(url));
});
