// GET /api/fx — taux de change en dollars US :
//   eurusd : dollars pour 1 euro (affichage en euros) ;
//   rates  : dollars pour 1 unité de chaque devise des places boursières suivies (papertrading).
// Source : Yahoo Finance (paires USDXXX=X, plus précises que XXXUSD=X pour les petites devises) ;
// repli : taux de référence quotidiens de la BCE. Devise sans taux fiable → absente (jamais de taux inventé).
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { BATCH, fromYahoo, parseYahoo, sparkBatch } from './_yahoo.js';

const TTL = 10 * 60_000;
const CCYS = ['EUR', 'GBP', 'CHF', 'JPY', 'CNY', 'HKD', 'KRW', 'TWD', 'INR', 'SGD', 'IDR', 'MYR', 'THB', 'AUD', 'NZD',
  'CAD', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK', 'PLN', 'TRY', 'SAR', 'ILS', 'ZAR', 'EGP', 'ARS'];

async function fromECB() {
  const xml = await fetchWithTimeout('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { as: 'text' });
  const perEur = {};
  for (const m of xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)) perEur[m[1]] = Number(m[2]);
  if (!perEur.USD) throw new Error('BCE : taux USD introuvable');
  const day = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const rates = { EUR: perEur.USD };
  for (const [c, v] of Object.entries(perEur)) if (c !== 'USD' && v > 0) rates[c] = perEur.USD / v;
  return { rates, time: day ? Date.parse(`${day}T15:00:00Z`) : null };
}

async function fromYahooAll() {
  const syms = CCYS.map((c) => (c === 'EUR' || c === 'GBP' ? `${c}USD=X` : `USD${c}=X`));
  const chunks = [];
  for (let i = 0; i < syms.length; i += BATCH) chunks.push(syms.slice(i, i + BATCH));
  const maps = await Promise.all(chunks.map((c) => sparkBatch(c).catch(() => new Map())));
  const rates = {};
  let time = null;
  for (const m of maps) {
    for (const [sym, payload] of m) {
      const q = parseYahoo(payload);
      if (!num(q.price) || q.price <= 0) continue;
      const direct = sym.endsWith('USD=X'); // EURUSD=X : dollars pour 1 euro ; USDKRW=X : wons pour 1 dollar
      const ccy = direct ? sym.slice(0, 3) : sym.slice(3, 6);
      rates[ccy] = direct ? q.price : 1 / q.price;
      time = Math.max(time ?? 0, q.lastTime ?? 0) || time;
    }
  }
  return { rates, time };
}

async function load() {
  const errors = [];
  let y = { rates: {}, time: null }, ecb = null;
  try { y = await fromYahooAll(); } catch (err) { errors.push(String(err.message || err)); }
  if (!y.rates.EUR) {
    try { const q = await fromYahoo('EURUSD=X'); if (num(q.price)) y.rates.EUR = q.price; } catch { /* repli BCE */ }
  }
  const missing = CCYS.filter((c) => !y.rates[c]);
  if (missing.length) {
    try { ecb = await fromECB(); } catch (err) { errors.push(String(err.message || err)); }
  }
  const rates = { ...y.rates };
  const sources = {};
  for (const c of Object.keys(y.rates)) sources[c] = 'Yahoo Finance';
  for (const c of missing) if (ecb?.rates[c]) { rates[c] = ecb.rates[c]; sources[c] = 'BCE'; }
  // Garde-fou : un taux EUR/USD aberrant n'est pas utilisé.
  if (!(rates.EUR > 0.5 && rates.EUR < 2)) throw new Error(errors.join(' | ') || 'taux EUR/USD invalide');
  return {
    eurusd: rates.EUR, source: sources.EUR, time: sources.EUR === 'BCE' ? ecb?.time ?? null : y.time,
    rates, sources, fetchedAt: Date.now(),
  };
}

export async function GET() {
  try {
    return json(await cached('fx', TTL, load), 200, 300);
  } catch (err) {
    return json({ error: 'Taux de change indisponibles', detail: String(err.message || err) }, 502);
  }
}
