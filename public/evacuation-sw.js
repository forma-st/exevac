/* Service worker de l'appli « Exercices d'évacuation » : garde la page et ses fichiers pour un usage hors ligne.
   Aucune donnée de rapport ne passe par ici (elles sont dans IndexedDB) ; les appels /api ne sont jamais mis en cache. */
const CACHE = "evacuation-v1";
const PAGE = "/evacuation";
const ASSETS = ["/logo-formast.png", "/evacuation.webmanifest", "/evacuation-icon-192.png", "/evacuation-icon-512.png"];
const isAsset = (url) => url.pathname.startsWith("/_next/static/") || ASSETS.includes(url.pathname);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

async function storePage(cache, res) {
  // jamais la page de connexion (redirection) ni une erreur
  if (res.ok && !res.redirected && res.type === "basic") await cache.put(PAGE, res);
}

/** La page ouverte envoie la liste de ses fichiers : on complète le cache et on retire les anciennes versions. */
async function precache(urls) {
  const cache = await caches.open(CACHE);
  const wanted = [...new Set([...urls, ...ASSETS])].map((u) => new URL(u, self.location.origin)).filter((u) => u.origin === self.location.origin && isAsset(u));
  try { await storePage(cache, await fetch(PAGE, { credentials: "same-origin", cache: "no-store" })); } catch {}
  await Promise.all(wanted.map(async (u) => {
    if (await cache.match(u.href)) return;
    try { const r = await fetch(u.href); if (r.ok) await cache.put(u.href, r); } catch {}
  }));
  const keep = new Set([...wanted.map((u) => u.href), new URL(PAGE, self.location.origin).href]);
  for (const req of await cache.keys()) if (!keep.has(req.url)) await cache.delete(req);
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "precache" && Array.isArray(e.data.urls)) e.waitUntil(precache(e.data.urls));
});

/** Page : réseau d'abord (5 s maximum), sinon la dernière version gardée. */
async function page(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(PAGE);
  try {
    const net = fetch(req);
    const res = cached ? await Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error("lent")), 5000))]) : await net;
    if (res.ok && !res.redirected && res.type === "basic") await cache.put(PAGE, res.clone());
    return res;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

async function asset(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate" && url.pathname === PAGE) e.respondWith(page(req));
  else if (isAsset(url)) e.respondWith(asset(req));
});
