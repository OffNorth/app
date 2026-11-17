// GET /api/bot?p=state|catalog|history — relais vers le bot de paper trading (dépôt OffNorth/idk).
// Le bot tourne sur un autre hébergeur et sert une petite API en http ; le site (https) la relaie,
// car un navigateur refuse d'appeler du http depuis une page https. La clé ?k= est transmise telle quelle :
// c'est le bot qui la vérifie (WEB_TOKEN). Adresse du bot : variable BOT_API_URL dans Vercel.
import { json } from './_lib.js';

const PAGES = {
  state: { timeout: 12_000, cdn: 20 },
  catalog: { timeout: 12_000, cdn: 600 },
  history: { timeout: 55_000, cdn: 3600 }, // simulation sur l'historique : jusqu'à ~1 min au premier calcul
};

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const page = q.get('p');
  const conf = Object.hasOwn(PAGES, page) ? PAGES[page] : null;
  if (!conf) return json({ error: 'page inconnue' }, 404, 0);
  const base = (process.env.BOT_API_URL || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/\s]+$/.test(base)) {
    return json({ error: 'Bot non relié : ajoutez BOT_API_URL (ex. http://51.75.0.1:25565) dans Vercel → Settings → Environment Variables, puis Redeploy.' }, 503, 0);
  }

  // Seuls les paramètres attendus sont transmis, dans un format contrôlé.
  const out = new URLSearchParams();
  const k = q.get('k');
  if (k && k.length <= 200) out.set('k', k);
  if (page === 'history') {
    if (q.get('market') === 'nas100') out.set('market', 'nas100');
    else out.set('market', 'gold');
    const from = q.get('from');
    if (/^\d{4}$/.test(from || '')) out.set('from', from);
    const ids = (q.get('ids') || '').split(',').filter((x) => /^[a-z0-9_@]{1,24}$/i.test(x)).slice(0, 20);
    if (ids.length) out.set('ids', ids.join(','));
  }

  try {
    const res = await fetch(`${base}/api/${page}?${out}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(conf.timeout) });
    const data = await res.json().catch(() => ({ error: 'réponse invalide du bot' }));
    return json(data, res.status, res.ok ? conf.cdn : 0);
  } catch (err) {
    const slow = err?.name === 'TimeoutError';
    return json({ error: slow ? 'Le bot calcule encore, réessayez dans quelques secondes.' : 'Bot injoignable (éteint, ou port fermé chez l’hébergeur).', retry: slow }, slow ? 504 : 502, 0);
  }
}
