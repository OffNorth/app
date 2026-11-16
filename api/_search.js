// GET /api/search?q=… — recherche de cryptos (CoinGecko) et d'actions / ETF (Yahoo Finance), toutes places.
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { YAHOO_HOSTS } from './_yahoo.js';

const LOGO_HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com']);
const safeLogo = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && LOGO_HOSTS.has(x.hostname) ? x.href : null; } catch { return null; } };

async function coins(q) {
  const key = process.env.COINGECKO_API_KEY;
  const j = await fetchWithTimeout(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`, { headers: key ? { 'x-cg-demo-api-key': key } : {}, timeout: 6000 });
  return (j?.coins || []).filter((c) => c.id && c.symbol).slice(0, 8).map((c) => ({
    kind: 'c', id: c.id, symbol: String(c.symbol).toUpperCase(), name: c.name, rank: num(c.market_cap_rank),
    logo: safeLogo(c.large), logoSmall: safeLogo(c.thumb) || safeLogo(c.large),
  }));
}

async function stocks(q) {
  for (const host of YAHOO_HOSTS) {
    try {
      const j = await fetchWithTimeout(`https://${host}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`, { timeout: 6000 });
      return (j?.quotes || []).filter((x) => ['EQUITY', 'ETF'].includes(x.quoteType) && x.symbol)
        .slice(0, 10).map((x) => ({
          kind: 's', id: x.symbol, symbol: x.symbol, name: x.longname || x.shortname || x.symbol,
          exchange: x.exchange || null, exchangeName: x.exchDisp || null, type: x.quoteType, sector: x.sectorDisp || x.sector || null,
        }));
    } catch { /* hôte suivant */ }
  }
  return [];
}

export async function GET(request) {
  const q = (new URL(request.url).searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 40) return json({ results: [] }, 200, 60);
  try {
    const data = await cached(`search:${q.toLowerCase()}`, 10 * 60_000, async () => {
      const [c, s] = await Promise.allSettled([coins(q), stocks(q)]);
      return { results: [...(c.value || []), ...(s.value || [])], partial: c.status === 'rejected' || s.status === 'rejected' };
    });
    return json(data, 200, 600);
  } catch (err) {
    return json({ error: 'Recherche indisponible', detail: String(err.message || err) }, 502);
  }
}
