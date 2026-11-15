// GET /api/indices — 13 indices boursiers (Chine, USA, Europe) avec sparkline de séance.
// Source principale : endpoint "chart" de Yahoo Finance (query1, puis query2 en repli).
// Dernier recours : Stooq (niveau seulement, sans sparkline).
// Toute valeur introuvable est renvoyée à null → affichée "n/d" côté client.
import { cached, fetchWithTimeout, json, num } from './_lib.js';

const TTL = 45_000;

export const INDICES = [
  { id: 'sse', region: 'chine', name: 'Shanghai Composite', yahoo: '000001.SS', stooq: '^shc' },
  { id: 'szse', region: 'chine', name: 'Shenzhen Component', yahoo: '399001.SZ' },
  { id: 'csi300', region: 'chine', name: 'CSI 300', yahoo: '000300.SS' },
  { id: 'hsi', region: 'chine', name: 'Hang Seng', yahoo: '^HSI', stooq: '^hsi' },
  { id: 'spx', region: 'usa', name: 'S&P 500', yahoo: '^GSPC', stooq: '^spx' },
  { id: 'ixic', region: 'usa', name: 'Nasdaq Composite', yahoo: '^IXIC', stooq: '^ndq' },
  { id: 'dji', region: 'usa', name: 'Dow Jones', yahoo: '^DJI', stooq: '^dji' },
  { id: 'rut', region: 'usa', name: 'Russell 2000', yahoo: '^RUT' },
  { id: 'cac', region: 'europe', name: 'CAC 40', yahoo: '^FCHI', stooq: '^cac' },
  { id: 'dax', region: 'europe', name: 'DAX', yahoo: '^GDAXI', stooq: '^dax' },
  { id: 'ftse', region: 'europe', name: 'FTSE 100', yahoo: '^FTSE', stooq: '^ukx' },
  { id: 'sx5e', region: 'europe', name: 'Euro Stoxx 50', yahoo: '^STOXX50E' },
  { id: 'ibex', region: 'europe', name: 'IBEX 35', yahoo: '^IBEX' },
];

const YAHOO_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const MAX_POINTS = 90;

/** Date "AAAA-MM-JJ" d'un instant dans un fuseau donné. */
function dayIn(tz, ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function marketState(meta, nowSec) {
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

function downsample(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  return out;
}

function parseYahoo(def, payload) {
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
  return {
    price,
    prevClose: prev,
    change: prev !== null ? price - prev : null,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    currency: m.currency || null,
    lastTime: num(m.regularMarketTime) ? m.regularMarketTime * 1000 : null,
    timezone: m.exchangeTimezoneName || null,
    state: marketState(m, nowSec),
    spark: pts.length >= 2 ? { start, end, points: downsample(pts, MAX_POINTS) } : null,
    source: 'Yahoo Finance',
  };
}

async function fromYahoo(def) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(def.yahoo)}?range=1d&interval=5m&includePrePost=false`;
      return parseYahoo(def, await fetchWithTimeout(url, { timeout: 7000 }));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Repli Stooq : CSV avec en-tête ; on ne lit que les colonnes identifiées par leur nom.
async function fromStooq(def) {
  if (!def.stooq) throw new Error('Stooq: symbole non couvert');
  const csv = await fetchWithTimeout(
    `https://stooq.com/q/l/?s=${encodeURIComponent(def.stooq)}&f=sd2t2ohlcp&h&e=csv`,
    { as: 'text', timeout: 6000 }
  );
  const [head, row] = csv.trim().split(/\r?\n/);
  if (!head || !row) throw new Error('Stooq: CSV vide');
  const cols = head.split(',').map((c) => c.trim().toLowerCase());
  const vals = row.split(',');
  const get = (name) => {
    const i = cols.findIndex((c) => c === name || c.startsWith(name));
    return i >= 0 ? Number(vals[i]) : NaN;
  };
  const price = get('close');
  if (!Number.isFinite(price) || price <= 0) throw new Error('Stooq: N/D');
  const prevRaw = get('prev');
  const prev = Number.isFinite(prevRaw) && prevRaw > 0 ? prevRaw : null;
  const dateStr = vals[cols.indexOf('date')];
  const lastTime = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? Date.parse(`${dateStr}T12:00:00Z`) : null;
  return {
    price,
    prevClose: prev,
    change: prev !== null ? price - prev : null,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    currency: null,
    lastTime,
    timezone: null,
    state: 'unknown',
    spark: null,
    source: 'Stooq',
  };
}

async function loadOne(def) {
  const base = { id: def.id, region: def.region, name: def.name };
  const errors = [];
  for (const provider of [fromYahoo, fromStooq]) {
    try {
      return { ...base, ...(await provider(def)) };
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }
  return { ...base, price: null, changePct: null, state: 'unknown', spark: null, source: null, errors };
}

async function load() {
  const indices = await Promise.all(INDICES.map(loadOne));
  if (indices.every((i) => i.price === null)) throw new Error('Aucune source d’indices disponible');
  return { indices, fetchedAt: Date.now() };
}

export async function GET() {
  try {
    return json(await cached('indices', TTL, load));
  } catch (err) {
    return json({ error: 'Données indices indisponibles', detail: String(err.message || err) }, 502);
  }
}
