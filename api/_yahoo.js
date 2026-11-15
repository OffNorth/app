// Utilitaires Yahoo Finance partagés par /api/indices et /api/stocks.
// Les fichiers préfixés par "_" dans /api ne sont pas exposés comme routes par Vercel.
import { fetchWithTimeout, num } from './_lib.js';

export const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const MAX_POINTS = 90;
export const BATCH = 20;

/** Date "AAAA-MM-JJ" d'un instant dans un fuseau donné. */
export function dayIn(tz, ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function marketState(meta, nowSec) {
  const reg = meta.currentTradingPeriod?.regular;
  const last = num(meta.regularMarketTime);
  if (!reg || !last) return 'unknown';
  const inSession = nowSec >= reg.start && nowSec < reg.end;
  if (!inSession) return 'closed';
  const tz = meta.exchangeTimezoneName || 'UTC';
  // En séance mais dernière cotation d'un autre jour → jour férié / pas encore coté.
  if (dayIn(tz, last * 1000) !== dayIn(tz, nowSec * 1000)) return 'closed';
  // Pas de cotation depuis plus de 45 min (pause déjeuner Asie, interruption…).
  if (nowSec - last > 45 * 60) return 'break';
  return 'open';
}

export function downsample(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

export function parseYahoo(payload) {
  const result = payload?.chart?.result?.[0];
  if (!result?.meta) throw new Error(payload?.chart?.error?.description || 'Yahoo: résultat vide');
  const m = result.meta;
  const price = num(m.regularMarketPrice);
  const prev = num(m.chartPreviousClose) ?? num(m.previousClose);
  if (price === null) throw new Error('Yahoo: prix absent');

  const ts = result.timestamp || [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const pts = [];
  for (let i = 0; i < ts.length; i++) {
    const c = num(closes[i]);
    if (c !== null) pts.push([ts[i], Math.round(c * 100) / 100]);
  }
  const periods = (m.tradingPeriods || []).flat().filter(Boolean);
  const start = periods.length ? Math.min(...periods.map((p) => p.start)) : pts[0]?.[0] ?? null;
  const end = periods.length ? Math.max(...periods.map((p) => p.end)) : pts.at(-1)?.[0] ?? null;

  const nowSec = Math.floor(Date.now() / 1000);
  const lastTime = num(m.regularMarketTime) ? m.regularMarketTime * 1000 : null;
  // Données figées chez Yahoo (ex. Merval) : dernière cotation de plus de 7 jours.
  const outdated = lastTime !== null && Date.now() - lastTime > 7 * 86400_000;
  // Clôture précédente non fiable : identique au cours, sans séance ni « previousClose ».
  const prevUnreliable = prev === price && !pts.length && num(m.previousClose) === null;
  const okPrev = prev !== null && !outdated && !prevUnreliable;
  return {
    price,
    prevClose: okPrev ? prev : null,
    change: okPrev ? price - prev : null,
    changePct: okPrev && prev ? ((price - prev) / prev) * 100 : null,
    currency: m.currency || null,
    lastTime,
    timezone: m.exchangeTimezoneName || null,
    outdated,
    state: outdated ? 'closed' : marketState(m, nowSec),
    spark: pts.length >= 2 ? { start, end, points: downsample(pts, MAX_POINTS) } : null,
    exchange: m.exchangeName || null,
    source: 'Yahoo Finance',
  };
}

/**
 * Lot de symboles → Map(symbole → payload au format « chart »).
 * v7/spark donne les métadonnées (prix, statut, fuseau), v8/spark la courbe de séance.
 */
export async function sparkBatch(symbols) {
  const q = symbols.map(encodeURIComponent).join(',');
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const [v7, v8] = await Promise.all([
        fetchWithTimeout(`https://${host}/v7/finance/spark?symbols=${q}&range=1d&interval=5m`, { timeout: 8000 }),
        fetchWithTimeout(`https://${host}/v8/finance/spark?symbols=${q}&range=1d&interval=5m`, { timeout: 8000 }).catch(() => ({})),
      ]);
      const out = new Map();
      for (const r of v7?.spark?.result || []) {
        const meta = r?.response?.[0]?.meta;
        if (!r?.symbol || !meta) continue;
        const p = v8?.[r.symbol];
        out.set(r.symbol, {
          chart: { result: [{ meta, timestamp: p?.timestamp || [], indicators: { quote: [{ close: p?.close || [] }] } }] },
        });
      }
      if (out.size) return out;
      lastErr = new Error('Yahoo spark: réponse vide');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

export async function fromYahoo(symbol) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`;
      return parseYahoo(await fetchWithTimeout(url, { timeout: 7000 }));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** map() avec au plus `limit` traitements simultanés (ménage les API gratuites). */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
