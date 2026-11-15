// GET /api/crypto — top 25 cryptos par capitalisation + données globales.
// Source principale : CoinGecko (gratuit, sans clé ; clé "Demo" optionnelle via COINGECKO_API_KEY).
// Repli : CoinPaprika (gratuit, sans clé).
import { cached, fetchWithTimeout, json, num } from './_lib.js';

const TTL = 45_000;
const LIMIT = 25;

function geckoHeaders() {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

async function fromCoinGecko() {
  const base = 'https://api.coingecko.com/api/v3';
  const [markets, global] = await Promise.all([
    fetchWithTimeout(
      `${base}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${LIMIT}&page=1&sparkline=false&price_change_percentage=24h`,
      { headers: geckoHeaders() }
    ),
    fetchWithTimeout(`${base}/global`, { headers: geckoHeaders() }).catch(() => null),
  ]);
  if (!Array.isArray(markets) || markets.length === 0) throw new Error('CoinGecko: réponse vide');
  const coins = markets.slice(0, LIMIT).map((c) => ({
    id: c.id,
    symbol: String(c.symbol || '').toUpperCase(),
    name: c.name,
    price: num(c.current_price),
    marketCap: num(c.market_cap),
    changePct: num(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h),
  }));
  const g = global?.data;
  return {
    coins,
    global: g
      ? {
          totalMarketCap: num(g.total_market_cap?.usd),
          totalChangePct: num(g.market_cap_change_percentage_24h_usd),
          btcDominance: num(g.market_cap_percentage?.btc),
          source: 'CoinGecko',
        }
      : await paprikaGlobal().catch(() => null),
    source: 'CoinGecko',
  };
}

async function paprikaGlobal() {
  const g = await fetchWithTimeout('https://api.coinpaprika.com/v1/global');
  return {
    totalMarketCap: num(g.market_cap_usd),
    totalChangePct: num(g.market_cap_change_24h),
    btcDominance: num(g.bitcoin_dominance_percentage),
    source: 'CoinPaprika',
  };
}

async function fromCoinPaprika() {
  const [tickers, global] = await Promise.all([
    fetchWithTimeout('https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=60'),
    paprikaGlobal().catch(() => null),
  ]);
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error('CoinPaprika: réponse vide');
  const coins = tickers
    .filter((t) => num(t.quotes?.USD?.market_cap))
    .sort((a, b) => b.quotes.USD.market_cap - a.quotes.USD.market_cap)
    .slice(0, LIMIT)
    .map((t) => ({
      id: t.id,
      symbol: String(t.symbol || '').toUpperCase(),
      name: t.name,
      price: num(t.quotes.USD.price),
      marketCap: num(t.quotes.USD.market_cap),
      changePct: num(t.quotes.USD.percent_change_24h),
    }));
  return { coins, global, source: 'CoinPaprika' };
}

async function load() {
  const errors = [];
  for (const provider of [fromCoinGecko, fromCoinPaprika]) {
    try {
      const data = await provider();
      return { ...data, fetchedAt: Date.now(), errors };
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }
  throw new Error(errors.join(' | '));
}

export async function GET() {
  try {
    return json(await cached('crypto', TTL, load));
  } catch (err) {
    return json({ error: 'Données crypto indisponibles', detail: String(err.message || err) }, 502);
  }
}
