// Service worker Marchés : coquille de l'app en cache + dernières données API pour le hors-ligne.
const VERSION = 'v9';
const SHELL = `marches-shell-${VERSION}`;
const DATA = `marches-data-${VERSION}`;
const IMG = 'marches-logos-v2'; // logos (servis par le relais /api/logo du site), conservés d'une version à l'autre
const ASSETS = [
  '/', '/index.html', '/styles.css', '/app.js', '/consent.js', '/manifest.webmanifest',
  '/i18n.js', '/snapshot.js', '/legal.js', '/cookies-page.js',
  '/mentions-legales.html', '/confidentialite.html', '/cookies.html', '/cgu.html',
  '/en/mentions-legales.html', '/en/confidentialite.html', '/en/cookies.html', '/en/cgu.html',
  '/zh/mentions-legales.html', '/zh/confidentialite.html', '/zh/cookies.html', '/zh/cgu.html',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, DATA, IMG]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Réponse en cache marquée pour que l'app sache qu'elle est hors ligne.
async function tagged(res) {
  const headers = new Headers(res.headers);
  headers.set('X-SW-Cache', '1');
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return; // aucun traitement des requêtes vers d'autres domaines

  // Logos (relais du site) : cache d'abord, réseau sinon.
  if (url.pathname === '/api/logo') {
    e.respondWith((async () => {
      const cache = await caches.open(IMG);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // API : réseau d'abord, repli sur la dernière réponse valide.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res.ok) cache.put(url.pathname + url.search, res.clone());
        return res;
      } catch {
        const hit = await cache.match(url.pathname + url.search);
        if (hit) return tagged(hit);
        return new Response(JSON.stringify({ error: 'Hors ligne' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    })());
    return;
  }

  // Navigation : réseau d'abord (pour récupérer les mises à jour), sinon coquille en cache.
  if (req.mode === 'navigate') {
    // Chaque page est mise en cache sous sa propre adresse (et non à la place de l'accueil).
    const key = url.pathname === '/' ? '/index.html' : url.pathname;
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(SHELL).then((c) => c.put(key, copy)));
      }
      return res;
    }).catch(async () => (await caches.match(key)) || caches.match('/index.html')));
    return;
  }

  // Fichiers statiques : cache immédiat + mise à jour en arrière-plan.
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
    e.waitUntil(net);
    return hit || (await net) || new Response('', { status: 504 });
  })());
});
