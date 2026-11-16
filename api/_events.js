// GET /api/events?sym=AAPL — événements passés d'une action, pour les repères du graphique :
//   dividendes des 5 dernières années (date de détachement et montant, Yahoo Finance) ;
//   publications de résultats des 4 derniers trimestres (date, BPA publié et attendu, Nasdaq ; actions américaines).
// Source indisponible → liste vide (jamais de date inventée).
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { YAHOO_HOSTS } from './_yahoo.js';

async function dividends(sym) {
  for (const host of YAHOO_HOSTS) {
    try {
      const r = (await fetchWithTimeout(`https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=5y&interval=1mo&events=div`, { timeout: 8000 }))?.chart?.result?.[0];
      if (!r) continue;
      return Object.values(r.events?.dividends || {})
        .map((d) => ({ time: num(d.date) ? d.date * 1000 : null, amount: num(d.amount) }))
        .filter((d) => d.time && d.amount != null && d.amount > 0)
        .sort((a, b) => a.time - b.time);
    } catch { /* hôte suivant */ }
  }
  return [];
}

// Dates « M/J/AAAA » de Nasdaq (heure de New York ; on garde le jour, à midi UTC pour éviter tout décalage de date).
function usDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(s || ''));
  return m ? Date.UTC(+m[3], +m[1] - 1, +m[2], 12) : null;
}
const toNum = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; };

async function earnings(sym) {
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(sym)) return []; // actions cotées aux États-Unis seulement
  try {
    const j = await fetchWithTimeout(`https://api.nasdaq.com/api/company/${encodeURIComponent(sym.replace('.', '-'))}/earnings-surprise`, {
      timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    return (j?.data?.earningsSurpriseTable?.rows || [])
      .map((r) => ({ time: usDate(r.dateReported), quarter: r.fiscalQtrEnd || null, eps: toNum(r.eps), consensus: toNum(r.consensusForecast), surprisePct: toNum(r.percentageSurprise) }))
      .filter((r) => r.time)
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

export async function GET(request) {
  const sym = new URL(request.url).searchParams.get('sym') || '';
  if (!/^[A-Za-z0-9.^=-]{1,20}$/.test(sym)) return json({ error: 'paramètres invalides' }, 400, 0);
  try {
    const d = await cached(`events:${sym}`, 6 * 3600_000, async () => {
      const [div, earn] = await Promise.all([dividends(sym), earnings(sym)]);
      return { symbol: sym, dividends: div, earnings: earn, sources: { dividends: 'Yahoo Finance', earnings: 'Nasdaq' }, fetchedAt: Date.now() };
    });
    return json(d, 200, 3600);
  } catch (err) {
    return json({ error: 'Événements indisponibles', detail: String(err.message || err) }, 502, 0);
  }
}
