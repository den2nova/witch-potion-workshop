/* Offline support: the page and scripts are fetched fresh when online (so updates arrive),
   images and data are served from the cache after the first load. */
const VERSION = '20261010005515';
const CACHE = 'potion-' + VERSION;
const CORE = [
  './', 'index.html', 'engine.js', 'data.js', 'render.js', 'audio.js', 'store.js', 'game.js', 'mini.js', 'gacha.js', 'app.js',
  'levels.json', 'shapes.json', 'news.json', 'manifest.webmanifest',
  'assets/bg_portrait.webp', 'assets/bg_landscape.webp', 'assets/title_logo.webp', 'assets/bottle_back.webp',
  'assets/bottle_front.webp', 'assets/bottle_mask.png', 'assets/bottle_cap.webp', 'assets/panel_frame.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('potion-') && k !== CACHE).map((k) => caches.delete(k))))
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
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((r) => r || caches.match('index.html'))));
    return;
  }
  // images, fonts: cache first
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
