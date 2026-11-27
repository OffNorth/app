// GET /api/bn?symbol=XAUUSDT&interval=1m → bougies (klines) du contrat perpétuel public Binance, telles quelles.
// Relais de secours de l'onglet Bot : le navigateur lit d'abord Binance directement ; s'il n'y arrive pas (réseau,
// pays ou navigateur qui bloque), il passe par ici. Fonction « edge » exécutée en Europe : Binance refuse les
// serveurs américains (451). Données publiques, sans compte ni clé. Cache CDN 10 s.
export const config = { runtime: 'edge', regions: ['fra1', 'cdg1'] };

const SYMBOLS = new Set(['XAUUSDT', 'XAGUSDT']);
const INTERVALS = new Set(['1m', '5m', '15m', '1h', '4h']);
const out = (body, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cache } });

export default async function handler(req) {
  const q = new URL(req.url).searchParams;
  const symbol = q.get('symbol') || '', interval = q.get('interval') || '';
  if (!SYMBOLS.has(symbol) || !INTERVALS.has(interval)) return out({ error: 'bad request' }, 400);
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=1000`, { signal: AbortSignal.timeout(7000) });
    if (!res.ok) return out({ error: `binance ${res.status}` }, 502);
    const rows = await res.json();
    if (!Array.isArray(rows)) return out({ error: 'binance: unexpected answer' }, 502);
    return out(rows, 200, 'public, max-age=0, s-maxage=10, stale-while-revalidate=20');
  } catch {
    return out({ error: 'binance unreachable' }, 502);
  }
}
