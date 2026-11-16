// GET /api/cryptocats — catégories de cryptomonnaies selon CoinGecko (capitalisation et variation sur 24 h).
// Une crypto peut figurer dans plusieurs catégories : les capitalisations se recoupent.
import { cached, fetchWithTimeout, json, num } from './_lib.js';

const LOGO_HOSTS = new Set(['coin-images.coingecko.com', 'assets.coingecko.com']);
const safeLogo = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && LOGO_HOSTS.has(x.hostname) ? x.href : null; } catch { return null; } };
const MAX = 40;

async function load() {
  const key = process.env.COINGECKO_API_KEY;
  const rows = await fetchWithTimeout('https://api.coingecko.com/api/v3/coins/categories?order=market_cap_desc', { headers: key ? { 'x-cg-demo-api-key': key } : {}, timeout: 9000 });
  if (!Array.isArray(rows) || !rows.length) throw new Error('CoinGecko : pas de catégories');
  const cats = rows.filter((c) => num(c.market_cap) > 0 && c.id && c.name)
    .sort((a, b) => b.market_cap - a.market_cap).slice(0, MAX)
    .map((c) => ({ id: String(c.id), name: String(c.name).slice(0, 60), marketCap: num(c.market_cap), changePct: num(c.market_cap_change_24h),
      volume: num(c.volume_24h), top: (c.top_3_coins_id || []).slice(0, 3), logo: safeLogo(c.top_3_coins?.[0]), updatedAt: c.updated_at || null }));
  return { categories: cats, source: 'CoinGecko', fetchedAt: Date.now() };
}

export async function GET() {
  try {
    return json(await cached('cryptocats', 10 * 60_000, load), 200, 300);
  } catch (err) {
    return json({ error: 'Catégories indisponibles', detail: String(err.message || err) }, 502, 0);
  }
}
