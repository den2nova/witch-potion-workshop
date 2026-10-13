/* Offline support.
   - Code (html/js/json) is fetched fresh when online and kept in a per-release cache as a fallback.
   - Images, sound and fonts live in one long-lived cache that survives releases. Each release ships
     asset-manifest.json (file -> content hash); on activation only files whose hash changed are dropped,
     so an update downloads just the code and the assets that really changed. */
const VERSION = '20261013215911';
const CODE = 'potion-code-' + VERSION;
const ASSETS = 'potion-assets';
const MANIFEST_KEY = '/__asset-manifest__';
const CORE = [
  './', 'index.html', 'engine.js', 'data.js', 'render.js', 'audio.js', 'store.js', 'game.js', 'mini.js', 'gacha.js', 'app.js',
  'solver-worker.js', 'levels.json', 'shapes.json', 'news.json', 'manifest.webmanifest',
];
const CORE_ASSETS = [
  'assets/bg_portrait.webp', 'assets/bg_landscape.webp', 'assets/title_logo.webp', 'assets/bottle_back.webp',
  'assets/bottle_front.webp', 'assets/bottle_mask.png', 'assets/bottle_cap.webp', 'assets/panel_frame.webp',
];

async function syncAssets() {
  const res = await fetch('asset-manifest.json', { cache: 'no-cache' });
  if (!res.ok) return;
  const next = await res.json();
  const cache = await caches.open(ASSETS);
  const prevRes = await cache.match(MANIFEST_KEY);
  const prev = prevRes ? await prevRes.json() : null;
  const base = new URL('./', self.location).href;
  for (const req of await cache.keys()) {
    const u = new URL(req.url);
    if (u.pathname === MANIFEST_KEY || u.origin !== self.location.origin) continue;
    const path = u.href.slice(base.length).split('?')[0];
    // a file that changed or is gone (or any file when there is no record of what was cached) is dropped
    if (!prev || next[path] === undefined || prev[path] !== next[path]) await cache.delete(req);
  }
  await cache.put(MANIFEST_KEY, new Response(JSON.stringify(next), { headers: { 'Content-Type': 'application/json' } }));
}

self.addEventListener('install', (e) => {
  e.waitUntil(Promise.all([
    caches.open(CODE).then((c) => c.addAll(CORE)),
    caches.open(ASSETS).then((c) => Promise.all(CORE_ASSETS.map((u) => c.match(u).then((hit) => hit || c.add(u).catch(() => {}))))),
  ]).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(syncAssets().catch(() => {})
    // older code caches and the old single-cache layout ('potion-<version>') go away
    .then(() => caches.keys())
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('potion-') && k !== CODE && k !== ASSETS).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;
  const isCode = sameOrigin && (req.mode === 'navigate' || /\.(js|html|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/'));
  if (isCode) {
    // network first, cache as fallback
    // a navigation Request cannot be re-used with options, so fetch its URL instead
    const fresh = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
    e.respondWith(fresh.then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CODE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
    return;
  }
  // images, sound, fonts: cache first, kept across releases
  e.respondWith(caches.open(ASSETS).then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') c.put(req, res.clone());
    return res;
  }))));
});
