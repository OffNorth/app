// GET /api/rates — taux des emprunts d'État américains (bons du Trésor), en % : cours Yahoo Finance des indices CBOE
//   ^IRX (13 semaines), ^FVX (5 ans), ^TNX (10 ans), ^TYX (30 ans).
// Pour chaque échéance : dernier taux, taux il y a ~1 mois et ~1 an (clôtures hebdomadaires).
// Écart 10 ans − 3 mois : négatif = courbe inversée. Échéance indisponible → null (jamais de valeur inventée).
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { YAHOO_HOSTS } from './_yahoo.js';

const TENORS = [
  { id: '3m', years: 0.25, yahoo: '^IRX' },
  { id: '5y', years: 5, yahoo: '^FVX' },
  { id: '10y', years: 10, yahoo: '^TNX' },
  { id: '30y', years: 30, yahoo: '^TYX' },
];

async function weekly(symbol) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const r = (await fetchWithTimeout(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1wk`, { timeout: 8000 }))?.chart?.result?.[0];
      const ts = r?.timestamp || [], c = r?.indicators?.quote?.[0]?.close || [];
      const points = ts.map((t, i) => [t * 1000, num(c[i])]).filter((p) => p[1] != null && p[1] > -5 && p[1] < 30);
      const last = num(r?.meta?.regularMarketPrice);
      const lastTime = num(r?.meta?.regularMarketTime) ? r.meta.regularMarketTime * 1000 : null;
      if (last == null || !points.length) throw new Error('Yahoo : pas de données');
      return { last, lastTime, points };
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

/** Taux le plus proche (antérieur ou égal) d'une date, dans des points [ms, valeur] triés. */
function at(points, ms) {
  let best = null;
  for (const p of points) { if (p[0] <= ms) best = p; else break; }
  return best ? best[1] : null;
}

async function load() {
  const res = await Promise.allSettled(TENORS.map((t) => weekly(t.yahoo)));
  const now = Date.now();
  const tenors = TENORS.map((t, i) => {
    const r = res[i].status === 'fulfilled' ? res[i].value : null;
    return {
      id: t.id, years: t.years, symbol: t.yahoo,
      rate: r ? r.last : null, lastTime: r ? r.lastTime : null,
      monthAgo: r ? at(r.points, now - 30 * 864e5) : null,
      yearAgo: r ? at(r.points, now - 365 * 864e5) : null,
    };
  });
  const by = Object.fromEntries(tenors.map((t) => [t.id, t]));
  // Écart 10 ans − 3 mois, semaine par semaine (dates communes aux deux séries).
  const r10 = res[2].status === 'fulfilled' ? res[2].value.points : [];
  const r3 = res[0].status === 'fulfilled' ? new Map(res[0].value.points.map((p) => [p[0], p[1]])) : new Map();
  const spreadHistory = r10.filter((p) => r3.has(p[0]) && p[0] >= now - 366 * 864e5).map((p) => [p[0], Math.round((p[1] - r3.get(p[0])) * 1000) / 1000]);
  const spread = by['10y'].rate != null && by['3m'].rate != null ? by['10y'].rate - by['3m'].rate : null;
  return { tenors, spread, inverted: spread == null ? null : spread < 0, spreadHistory, source: 'Yahoo Finance (CBOE)', fetchedAt: now };
}

export async function GET() {
  try {
    const d = await cached('rates', 30 * 60_000, load);
    if (d.tenors.every((t) => t.rate == null)) return json({ error: 'Taux indisponibles' }, 502, 0);
    return json(d, 200, 900);
  } catch (err) {
    return json({ error: 'Taux indisponibles', detail: String(err.message || err) }, 502, 0);
  }
}
