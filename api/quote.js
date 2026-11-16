// GET /api/quote?kind=c&ids=pepe,ondo | kind=s&ids=TSLA,MC.PA — cours d'actifs hors des listes principales.
// Cryptos : CoinGecko /coins/markets (repli : aucun → n/d). Actions / ETF : Yahoo Finance (appels groupés).
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { BATCH, fromYahoo, mapLimit, parseYahoo, sparkBatch } from './_yahoo.js';
import { labelOf, logoURL, tvFor } from './stocks.js';

const LOGO_HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com']);
const safeLogo = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && LOGO_HOSTS.has(x.hostname) ? x.href : null; } catch { return null; } };

async function cryptoQuotes(ids) {
  const key = process.env.COINGECKO_API_KEY;
  const list = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.map(encodeURIComponent).join(',')}&price_change_percentage=1h,24h,7d`,
    { headers: key ? { 'x-cg-demo-api-key': key } : {} });
  return (Array.isArray(list) ? list : []).map((c) => {
    const logo = safeLogo(c.image);
    return {
      id: c.id, symbol: String(c.symbol || '').toUpperCase(), name: c.name, rank: num(c.market_cap_rank),
      price: num(c.current_price), marketCap: num(c.market_cap),
      changePct: num(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h),
      change1h: num(c.price_change_percentage_1h_in_currency), change7d: num(c.price_change_percentage_7d_in_currency),
      logo, logoSmall: logo && logo.includes('/large/') ? logo.replace('/large/', '/small/') : logo,
    };
  });
}

async function stockQuotes(symbols) {
  const chunks = [];
  for (let i = 0; i < symbols.length; i += BATCH) chunks.push(symbols.slice(i, i + BATCH));
  const maps = await Promise.all(chunks.map((c) => sparkBatch(c).catch(() => new Map())));
  const batch = new Map(maps.flatMap((m) => [...m]));
  const out = await mapLimit(symbols, 6, async (s) => {
    let q = null;
    try { q = batch.has(s) ? parseYahoo(batch.get(s)) : await fromYahoo(s); } catch { return null; }
    return {
      id: s, symbol: s, label: labelOf(s, s), price: q.price, currency: q.currency, change: q.change, changePct: q.changePct,
      state: q.state, lastTime: q.lastTime, timezone: q.timezone, session: q.session, exchange: q.exchange,
      logo: logoURL(s, 128), logoSmall: logoURL(s, 64), tv: tvFor(q.exchange, s),
    };
  });
  return out.filter(Boolean);
}

export async function GET(request) {
  const p = new URL(request.url).searchParams;
  const kind = p.get('kind');
  const ids = [...new Set((p.get('ids') || '').split(',').map((x) => x.trim()).filter(Boolean))].slice(0, 30);
  const ok = kind === 'c' ? ids.every((x) => /^[a-z0-9-]{1,64}$/.test(x)) : kind === 's' ? ids.every((x) => /^[A-Za-z0-9.^=&-]{1,20}$/.test(x)) : false;
  if (!ok || !ids.length) return json({ error: 'paramètres invalides' }, 400, 0);
  try {
    const key = `quote:${kind}:${[...ids].sort().join(',')}`;
    const items = await cached(key, 45_000, () => (kind === 'c' ? cryptoQuotes(ids) : stockQuotes(ids)));
    return json({ items, fetchedAt: Date.now(), source: kind === 'c' ? 'CoinGecko' : 'Yahoo Finance' });
  } catch (err) {
    return json({ error: 'Cours indisponibles', detail: String(err.message || err) }, 502);
  }
}
