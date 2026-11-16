// GET /api/sentiment — indicateurs de sentiment :
//   cryptos : indice « Fear & Greed » (alternative.me), valeur du jour et 30 derniers jours ;
//   actions : VIX, volatilité implicite du S&P 500 (CBOE, cours Yahoo Finance).
// Source indisponible → section absente (jamais de valeur inventée).
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { fromYahoo } from './_yahoo.js';

async function fng() {
  const j = await fetchWithTimeout('https://api.alternative.me/fng/?limit=30', { timeout: 7000 });
  const rows = (j?.data || []).map((d) => ({ value: num(Number(d.value)), label: d.value_classification || null, time: num(Number(d.timestamp)) ? Number(d.timestamp) * 1000 : null }))
    .filter((d) => d.value != null && d.value >= 0 && d.value <= 100 && d.time);
  if (!rows.length) throw new Error('Fear & Greed : pas de données');
  return { now: rows[0], history: rows.reverse(), source: 'alternative.me' };
}
async function vix() {
  const q = await fromYahoo('^VIX');
  if (!num(q.price)) throw new Error('VIX : pas de cours');
  return { price: q.price, changePct: q.changePct, lastTime: q.lastTime, state: q.state, source: 'Yahoo Finance (CBOE)' };
}

async function load() {
  const [f, v] = await Promise.allSettled([fng(), vix()]);
  return { fng: f.status === 'fulfilled' ? f.value : null, vix: v.status === 'fulfilled' ? v.value : null, fetchedAt: Date.now() };
}

export async function GET() {
  try {
    const d = await cached('sentiment', 15 * 60_000, load);
    if (!d.fng && !d.vix) return json({ error: 'Sentiment indisponible' }, 502, 0);
    return json(d, 200, 600);
  } catch (err) {
    return json({ error: 'Sentiment indisponible', detail: String(err.message || err) }, 502, 0);
  }
}
