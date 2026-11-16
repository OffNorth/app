// GET /api/news?q=AAPL — derniers titres d'actualité liés à un actif (recherche Yahoo Finance).
// Seuls le titre, l'éditeur, la date et le lien vers l'article d'origine sont repris (aucun texte d'article).
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { YAHOO_HOSTS } from './_yahoo.js';

async function load(q) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const j = await fetchWithTimeout(`https://${host}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=0&newsCount=10&listsCount=0`, { timeout: 7000 });
      const items = (j?.news || []).map((n) => {
        let link = null;
        try { const u = new URL(n.link); if (u.protocol === 'https:') link = u.href; } catch { /* lien invalide : ignoré */ }
        return { title: String(n.title || '').slice(0, 300), publisher: String(n.publisher || '').slice(0, 80) || null, link, time: num(n.providerPublishTime) ? n.providerPublishTime * 1000 : null };
      }).filter((n) => n.title && n.link);
      return { items, source: 'Yahoo Finance', fetchedAt: Date.now() };
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (!/^[\p{L}\p{N} .^=&'-]{1,40}$/u.test(q)) return json({ error: 'paramètre invalide' }, 400, 0);
  try {
    return json(await cached(`news:${q.toLowerCase()}`, 15 * 60_000, () => load(q)), 200, 600);
  } catch (err) {
    return json({ error: 'Actualités indisponibles', detail: String(err.message || err) }, 502, 0);
  }
}
