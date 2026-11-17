// Serveur de développement local sans dépendance : sert /public et exécute /api/*.js
// comme le ferait Vercel (fonctions exportant GET(request) → Response).
// Usage : npm run dev  → http://localhost:5173
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 5173;

// Applique les en-têtes de vercel.json en local (CSP, etc.), pour tester comme en production.
const VERCEL = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const HEADER_RULES = (VERCEL.headers || []).map((r) => ({
  // Motif avec expression régulière (ex. « /((?!bot\\.html$).*) ») : utilisé tel quel ; sinon chemin simple.
  re: /\(\?/.test(r.source) ? new RegExp(`^${r.source}$`) : new RegExp(`^${r.source.replace(/\./g, '\\.').replace('(.*)', '.*')}$`),
  headers: Object.fromEntries(r.headers.map((h) => [h.key, h.value])),
}));
const extraHeaders = (path) => Object.assign({}, ...HEADER_RULES.filter((r) => r.re.test(path)).map((r) => r.headers));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const FEEDS = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8')).rewrites.map((r) => r.source.slice(5));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      let name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, '');
      // Même réécriture que vercel.json : les flux regroupés passent par /api/feeds?r=<nom>.
      if (FEEDS.includes(name)) { url.searchParams.set('r', name); name = 'feeds'; }
      const mod = await import(pathToFileURL(join(ROOT, 'api', `${name}.js`)).href);
      const handler = mod[req.method];
      if (!handler) { res.writeHead(405); res.end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const init = req.method === 'GET' || req.method === 'HEAD' ? {} : { method: req.method, body: Buffer.concat(chunks), headers: { 'Content-Type': req.headers['content-type'] || 'application/json' } };
      const response = await handler(new Request(url, init));
      res.writeHead(response.status, { ...extraHeaders(url.pathname), ...Object.fromEntries(response.headers) });
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    let path = normalize(join(PUBLIC, decodeURIComponent(url.pathname)));
    if (!path.startsWith(PUBLIC)) throw Object.assign(new Error('forbidden'), { code: 'ENOENT' });
    if ((await stat(path).catch(() => null))?.isDirectory()) path = join(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { ...extraHeaders(url.pathname), 'Content-Type': TYPES[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch (err) {
    const code = err.code === 'ENOENT' || err.code === 'ERR_MODULE_NOT_FOUND' ? 404 : 500;
    res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(code === 404 ? 'Not found' : String(err.stack || err));
  }
}).listen(PORT, () => console.log(`Marchés → http://localhost:${PORT}`));
