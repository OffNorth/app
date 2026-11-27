// Service worker Marchés : coquille de l'app en cache + dernières données API pour le hors-ligne.
// Réseau d'abord pour tout (pages, scripts, styles, API) : la version en ligne est toujours celle affichée ;
// le cache ne sert qu'hors connexion. Les logos restent en cache d'abord (ils ne changent pas).
const VERSION = 'v59'; // à garder égal à APP_BUILD dans assets/app.js
const SHELL = `marches-shell-${VERSION}`;
const DATA = `marches-data-${VERSION}`;
const IMG = 'marches-logos-v2'; // logos (servis par le relais /api/logo du site), conservés d'une version à l'autre
const ASSETS = [
  '/', '/index.html', '/manifest.webmanifest',
  '/assets/styles.css', '/assets/theme.js', '/assets/app.js', '/assets/consent.js', '/assets/i18n.js', '/assets/snapshot.js', '/assets/paper.js', '/assets/paper-engine.js', '/assets/indicators.js', '/assets/portfolio.js', '/assets/glossary.js', '/assets/analysis.js', '/assets/comfort.js', '/assets/agents.js', '/assets/bot.js', '/assets/formation.js',
  '/assets/tradechart.js', '/assets/legal.js', '/assets/cookies-page.js',
  '/vendor/lightweight-charts/lightweight-charts.standalone.production.js',
  '/mentions-legales.html', '/confidentialite.html', '/cookies.html', '/cgu.html',
  '/formation.html', '/en/formation.html', '/zh/formation.html',
  '/en/mentions-legales.html', '/en/confidentialite.html', '/en/cookies.html', '/en/cgu.html',
  '/zh/mentions-legales.html', '/zh/confidentialite.html', '/zh/cookies.html', '/zh/cgu.html',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png', '/icons/favicon-32.png',
];

self.addEventListener('install', (e) => {
  // Fichiers de la nouvelle version téléchargés sans passer par le cache HTTP du navigateur.
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, DATA, IMG]);
    const keys = await caches.keys();
    const isUpdate = keys.some((k) => k.startsWith('marches-shell-') && k !== SHELL);
    for (const k of keys) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
    // Mise à jour : on recharge les pages ouvertes pour qu'elles affichent tout de suite la nouvelle version.
    if (isUpdate) {
      for (const c of await self.clients.matchAll({ type: 'window' })) if ('navigate' in c) c.navigate(c.url).catch(() => {});
    }
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

  // Fichiers statiques : réseau d'abord (revalidé auprès du serveur), cache seulement hors connexion.
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    try {
      const res = await fetch(req, { cache: 'no-cache' });
      if (res.ok) e.waitUntil(cache.put(req, res.clone()));
      return res;
    } catch {
      return (await cache.match(req, { ignoreSearch: true })) || new Response('', { status: 504 });
    }
  })());
});

// Alertes de prix : notification reçue (contenu chiffré de bout en bout, déchiffré par le navigateur).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Marchés', {
    body: d.body || '',
    tag: typeof d.tag === 'string' ? d.tag : undefined,
    icon: '/icons/icon-192.png',
    data: { url: typeof d.url === 'string' ? d.url : '/' },
  }));
});

// Toucher la notification : ouvre (ou ramène au premier plan) l'app, uniquement sur une page du site.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin);
  if (url.origin !== self.location.origin) return;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (win) {
      await win.focus();
      if ('navigate' in win) await win.navigate(url.href).catch(() => {});
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
