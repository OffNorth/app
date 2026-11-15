// GET /api/crypto — top 100 cryptos par capitalisation, HORS stablecoins et jetons « wrappés »,
// variations 1 h / 24 h / 7 j, + données globales. Le client affiche le top 25, 50 ou 100.
// Source principale : CoinGecko (gratuit, sans clé ; clé "Demo" optionnelle via COINGECKO_API_KEY).
// Repli : CoinPaprika (gratuit, sans clé).
import { cached, fetchWithTimeout, json, num } from './_lib.js';

const TTL = 45_000;
const LIMIT = 100;
const FETCH = 150; // marge : on retire les stablecoins et dérivés puis on garde les 100 premiers
const GECKO = 'https://api.coingecko.com/api/v3';

// Filet de sécurité si la catégorie CoinGecko est indisponible (et pour le repli CoinPaprika).
const STABLE_SYMBOLS = new Set([
  'USDT', 'USDC', 'USDS', 'USDE', 'DAI', 'USD1', 'RLUSD', 'USDG', 'PYUSD', 'USDF', 'USDD', 'BFUSD',
  'FDUSD', 'TUSD', 'BUSD', 'FRAX', 'GHO', 'USD0', 'USDTB', 'EURC', 'CRVUSD', 'GUSD', 'USDP', 'LUSD',
  'SUSD', 'USDB', 'USDX', 'USDGO', 'OUSD', 'AUSD', 'PUSD', 'USDO', 'EURS', 'EURT', 'XSGD',
  'SUSDS', 'SUSDE', 'SDAI', 'SFRAX', 'SYRUPUSDC', 'SYRUPUSDT', 'STUSDT', 'USDY', 'USYC',
]);
// Jetons « wrappés » ou stakés : doublons de BTC/ETH/SOL qui encombreraient la heatmap.
const DERIVATIVE_SYMBOLS = new Set([
  'WBTC', 'WETH', 'STETH', 'WSTETH', 'WBETH', 'WEETH', 'EETH', 'CBBTC', 'CBETH', 'RETH', 'METH',
  'EZETH', 'RSETH', 'LBTC', 'BTCB', 'SOLVBTC', 'JITOSOL', 'MSOL', 'BNSOL', 'JUPSOL', 'TBTC',
]);

// Logos : uniquement des URL https des CDN d'images des deux sources.
const LOGO_HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com', 'static.coinpaprika.com']);
function safeLogo(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && LOGO_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function geckoHeaders() {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

/** Identifiants CoinGecko de la catégorie « stablecoins » (mis en cache 6 h). */
async function stablecoinIds() {
  try {
    const { ids } = await cached('stablecoin-ids', 6 * 3600_000, async () => {
      const list = await fetchWithTimeout(
        `${GECKO}/coins/markets?vs_currency=usd&category=stablecoins&order=market_cap_desc&per_page=150&page=1`,
        { headers: geckoHeaders() }
      );
      if (!Array.isArray(list) || !list.length) throw new Error('catégorie stablecoins vide');
      return { ids: list.map((c) => c.id) };
    });
    return new Set(ids);
  } catch {
    return new Set();
  }
}

async function fromCoinGecko() {
  const [markets, global, stableIds] = await Promise.all([
    fetchWithTimeout(
      `${GECKO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${FETCH}&page=1&sparkline=false&price_change_percentage=1h,24h,7d`,
      { headers: geckoHeaders() }
    ),
    fetchWithTimeout(`${GECKO}/global`, { headers: geckoHeaders() }).catch(() => null),
    stablecoinIds(),
  ]);
  if (!Array.isArray(markets) || markets.length === 0) throw new Error('CoinGecko: réponse vide');
  const isStable = (c) => {
    const s = String(c.symbol || '').toUpperCase();
    return stableIds.has(c.id) || STABLE_SYMBOLS.has(s) || DERIVATIVE_SYMBOLS.has(s);
  };
  const coins = markets.filter((c) => !isStable(c)).slice(0, LIMIT).map((c) => {
    const logo = safeLogo(c.image); // 250 px ; la variante /small/ fait 50 px
    return {
      id: c.id,
      symbol: String(c.symbol || '').toUpperCase(),
      name: c.name,
      price: num(c.current_price),
      marketCap: num(c.market_cap),
      changePct: num(c.price_change_percentage_24h_in_currency ?? c.price_change_percentage_24h),
      change1h: num(c.price_change_percentage_1h_in_currency),
      change7d: num(c.price_change_percentage_7d_in_currency),
      logo,
      logoSmall: logo && logo.includes('/large/') ? logo.replace('/large/', '/small/') : logo,
    };
  });
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
    fetchWithTimeout('https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=200'),
    paprikaGlobal().catch(() => null),
  ]);
  if (!Array.isArray(tickers) || tickers.length === 0) throw new Error('CoinPaprika: réponse vide');
  const coins = tickers
    .filter((t) => {
      const s = String(t.symbol || '').toUpperCase();
      return num(t.quotes?.USD?.market_cap) && !STABLE_SYMBOLS.has(s) && !DERIVATIVE_SYMBOLS.has(s);
    })
    .sort((a, b) => b.quotes.USD.market_cap - a.quotes.USD.market_cap)
    .slice(0, LIMIT)
    .map((t) => ({
      id: t.id,
      symbol: String(t.symbol || '').toUpperCase(),
      name: t.name,
      price: num(t.quotes.USD.price),
      marketCap: num(t.quotes.USD.market_cap),
      changePct: num(t.quotes.USD.percent_change_24h),
      change1h: num(t.quotes.USD.percent_change_1h),
      change7d: num(t.quotes.USD.percent_change_7d),
      logo: safeLogo(`https://static.coinpaprika.com/coin/${encodeURIComponent(t.id)}/logo.png`),
      logoSmall: safeLogo(`https://static.coinpaprika.com/coin/${encodeURIComponent(t.id)}/logo.png`),
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
