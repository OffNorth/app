// GET /api/candles?kind=c|s|i&symbol=BTC&id=bitcoin&tf=15m&ref=64000
// Bougies OHLC pour le graphique de trading (mode démo).
// Actions et indices : Yahoo Finance. Cryptos : Yahoo Finance (SYMBOLE-USD), vérifié contre le cours de référence
// (un même ticker peut désigner un autre actif chez Yahoo) ; sinon CoinGecko /ohlc.
// Rien d'inventé : si aucune source fiable ne répond, erreur → le client affiche « n/d ».
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { YAHOO_HOSTS } from './_yahoo.js';

const TF = {
  '5m': { interval: '5m', range: '5d', ttl: 30_000, gecko: 1 },
  '15m': { interval: '15m', range: '1mo', ttl: 45_000, gecko: 1 },
  '1h': { interval: '60m', range: '3mo', ttl: 60_000, gecko: 7 },
  '4h': { interval: '60m', range: '1y', ttl: 120_000, group: 4, gecko: 30 },
  '1d': { interval: '1d', range: '5y', ttl: 600_000, gecko: 365 },
  // Mensuel sur 10 ans (saisonnalité, simulateur) : Yahoo seulement (CoinGecko gratuit limité à 365 jours).
  '1mo': { interval: '1mo', range: '10y', ttl: 6 * 3600_000, gecko: null },
};
const MAX = 1500;
const r8 = (v) => Number(v.toPrecision(8)); // précision largement suffisante, réponse plus légère

async function yahoo(symbol, tf) {
  let lastErr;
  for (const host of YAHOO_HOSTS) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${tf.range}&interval=${tf.interval}&includePrePost=false`;
      const r = (await fetchWithTimeout(url, { timeout: 8000 }))?.chart?.result?.[0];
      const ts = r?.timestamp, q = r?.indicators?.quote?.[0];
      if (!ts?.length || !q) throw new Error('Yahoo : pas de données');
      let candles = [];
      for (let i = 0; i < ts.length; i++) {
        const o = num(q.open[i]), h = num(q.high[i]), l = num(q.low[i]), c = num(q.close[i]);
        const v = num(q.volume?.[i]);
        if (o != null && h != null && l != null && c != null) candles.push([ts[i], r8(o), r8(h), r8(l), r8(c), v ?? null]);
      }
      if (tf.group) candles = group(candles, tf.group * 3600);
      return { candles: candles.slice(-MAX), currency: r.meta?.currency || null, last: num(r.meta?.regularMarketPrice), source: 'Yahoo Finance' };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Regroupe des bougies horaires en bougies de `sec` secondes (alignées sur l'heure UTC). */
function group(candles, sec) {
  const out = [];
  for (const [t, o, h, l, c, v] of candles) {
    const k = Math.floor(t / sec) * sec;
    const last = out[out.length - 1];
    if (last && last[0] === k) { last[2] = Math.max(last[2], h); last[3] = Math.min(last[3], l); last[4] = c; last[5] = v == null || last[5] == null ? null : last[5] + v; }
    else out.push([k, o, h, l, c, v ?? null]);
  }
  return out;
}

async function gecko(id, tf) {
  const key = process.env.COINGECKO_API_KEY;
  const rows = await fetchWithTimeout(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${tf.gecko}`,
    { headers: key ? { 'x-cg-demo-api-key': key } : {} });
  if (!Array.isArray(rows) || !rows.length) throw new Error('CoinGecko : pas de données');
  const candles = rows.map((r) => [Math.floor(r[0] / 1000), num(r[1]), num(r[2]), num(r[3]), num(r[4])]).filter((r) => r.every((v) => v != null));
  return { candles, currency: 'USD', last: candles[candles.length - 1]?.[4] ?? null, source: 'CoinGecko' };
}

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const kind = q.get('kind'), tfKey = q.get('tf') || '15m', symbol = q.get('symbol') || '', id = q.get('id') || '';
  const ref = Number(q.get('ref'));
  const tf = TF[tfKey];
  if (!tf || !['c', 's', 'i', 'm'].includes(kind) || !/^[A-Za-z0-9.^=&-]{1,20}$/.test(symbol) || (id && !/^[a-z0-9-]{1,64}$/.test(id))) {
    return json({ error: 'paramètres invalides' }, 400, 0);
  }
  try {
    const data = await cached(`candles:${kind}:${symbol}:${id}:${tfKey}`, tf.ttl, async () => {
      if (kind !== 'c') return yahoo(symbol, tf); // actions et indices : symbole Yahoo
      const errors = [];
      try {
        const y = await yahoo(`${symbol.toUpperCase()}-USD`, tf);
        // Garde-fou : le ticker Yahoo doit correspondre au même actif (écart de cours < 5 %).
        if (!Number.isFinite(ref) || ref <= 0 || (y.last && Math.abs(y.last / ref - 1) < 0.05)) return y;
        errors.push('Yahoo : autre actif pour ce ticker');
      } catch (err) {
        errors.push(String(err.message || err));
      }
      if (!id || !tf.gecko) throw new Error(errors.join(' | '));
      return gecko(id, tf);
    });
    return json({ ...data, tf: tfKey }, 200, Math.round(tf.ttl / 1000));
  } catch (err) {
    return json({ error: 'Bougies indisponibles', detail: String(err.message || err) }, 502, 0);
  }
}
