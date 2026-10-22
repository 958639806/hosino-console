// Service Worker：/api 永不缓存；带 ?v= 的静态资源按版本缓存（版本变了就是新 URL）；页面本身网络优先，离线时回退缓存。
const VERSION = new URL(location.href).searchParams.get("v") || "dev";
const CACHE = "hosino-" + VERSION;
self.addEventListener("install", e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(["/", "/offline.html"]).catch(() => {}))); });
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return; // 不拦截
  if (e.request.mode === "navigate") {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put("/", c)); return r; })
      .catch(() => caches.match("/").then(r => r || caches.match("/offline.html"))));
    return;
  }
  if (u.searchParams.has("v")) { // 版本化资源：缓存优先
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })));
  }
});
