// GET /api/tv?symbol=HYPE&name=Hyperliquid → { tv: "CRYPTO:HYPEHUSD", description } ou { tv: null }
// Trouve le symbole TradingView d'une crypto (indice « CRYPTO:…USD » de TradingView).
// Les noms ne sont pas toujours prévisibles (ex. Hyperliquid = HYPEHUSD), d'où la recherche.
// Résultat mis en cache 24 h (mémoire + CDN). Aucun symbole deviné : sans correspondance → null.
import { cached, fetchWithTimeout, json } from './_lib.js';

const TTL = 24 * 3600_000;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function resolve(sym, name) {
  const url = `https://symbol-search.tradingview.com/symbol_search/v3/?text=${encodeURIComponent(sym)}&exchange=CRYPTO&hl=0&lang=fr&domain=production`;
  const res = await fetchWithTimeout(url, {
    timeout: 6000,
    headers: { Origin: 'https://www.tradingview.com', Referer: 'https://www.tradingview.com/' },
  });
  const cands = (res?.symbols || []).filter(
    (s) => s.exchange === 'CRYPTO' && s.currency_code === 'USD' && /^[A-Z0-9.]+$/.test(s.symbol || '')
  );
  const n = norm(name);
  const pick =
    // 1. même nom et symbole qui commence par le ticker (ex. Hyperliquid → HYPEHUSD)
    cands.find((s) => n && norm(s.description) === n && s.symbol.startsWith(sym)) ||
    // 2. symbole exact TICKERUSD (ex. LEO → LEOUSD « UNUS SED LEO »)
    cands.find((s) => s.symbol === `${sym}USD`) ||
    // 3. ticker en préfixe et noms qui se recoupent
    cands.find((s) => {
      const d = norm(s.description);
      return n && d && s.symbol.startsWith(sym) && (d.includes(n) || n.includes(d));
    });
  return pick ? { tv: `CRYPTO:${pick.symbol}`, description: pick.description } : { tv: null };
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const sym = String(params.get('symbol') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
  const name = String(params.get('name') || '').slice(0, 80);
  if (!sym) return json({ error: 'Paramètre symbol manquant' }, 400);
  try {
    const data = await cached(`tv:${sym}:${norm(name)}`, TTL, () => resolve(sym, name));
    return json({ symbol: sym, ...data }, 200, 86400);
  } catch (err) {
    return json({ symbol: sym, tv: null, error: 'Recherche TradingView indisponible', detail: String(err.message || err) }, 502);
  }
}
