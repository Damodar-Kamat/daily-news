// Offline support: the page, its data and recently seen images keep working without a connection.
// Same-origin files are network-first (always fresh when online); images and fonts are cache-first.
const SHELL = "shell-v1";
const IMAGES = "images-v1";
const FONTS = "fonts-v1";
const SHELL_FILES = [
  "./", "index.html", "style.css", "app.js", "data.js", "version.json", "manifest.webmanifest",
  "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, IMAGES, FONTS].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Never touch GitHub API calls (they carry the refresh token) or anything else we don't know.
  if (url.origin === self.location.origin) return e.respondWith(networkFirst(req, url));
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") return e.respondWith(cacheFirst(req, FONTS, 40));
  if (req.destination === "image" && url.protocol === "https:") return e.respondWith(cacheFirst(req, IMAGES, 200));
});

async function networkFirst(req, url) {
  const cache = await caches.open(SHELL);
  const key = url.origin + url.pathname; // ignore ?t=… cache-busting so the cache doesn't grow
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(key, res.clone());
    return res;
  } catch {
    const hit = await cache.match(key);
    if (hit) return hit;
    if (req.mode === "navigate") return (await cache.match(new URL("./", self.location).href)) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === "opaque") {
      await cache.put(req, res.clone());
      trim(cache, max);
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function trim(cache, max) {
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}
