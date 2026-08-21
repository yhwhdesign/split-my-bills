// Minimal service worker — required for PWA installability.
// Currently pass-through (no offline caching yet); that's a future enhancement.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Pass-through for now — just being present enables installability.
});