// Munshi service worker.
//
// Goal is repeat-load speed, not offline data. The app shell (HTML, JS, CSS,
// icons) is served from cache so opening the app is near-instant; every API
// call still goes to the network so the numbers on screen are never stale.
const VERSION = "munshi-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(["/", "/index.html", "/manifest.webmanifest"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

// Drop caches from older versions so a deploy can't leave stale files behind.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Anything not on this origin is the API (or an external service).
  // Never cache it — business data must always come fresh from the server.
  if (url.origin !== self.location.origin) return;

  // Build output is content-hashed, so a cached file is never the wrong one.
  if (url.pathname.startsWith("/assets/") || /\.(png|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(ASSETS).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // Navigations: try the network first so a new deploy is picked up
  // immediately, and fall back to cache when the connection drops.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/index.html"))
    );
  }
});
