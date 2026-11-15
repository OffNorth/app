// GET /api/fx — taux EUR/USD (nombre de dollars pour 1 euro), pour afficher les montants en euros.
// Source : Yahoo Finance (EURUSD=X, quasi temps réel) ; repli : taux de référence quotidien de la BCE.
// Si aucune source ne répond : erreur 502 → le client reste en dollars (jamais de taux inventé).
import { cached, fetchWithTimeout, json, num } from './_lib.js';
import { fromYahoo } from './_yahoo.js';

const TTL = 10 * 60_000;

async function fromECB() {
  const xml = await fetchWithTimeout('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml', { as: 'text' });
  const rate = num(Number(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/.exec(xml)?.[1]));
  const day = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  if (!rate) throw new Error('BCE : taux USD introuvable');
  // Taux publié vers 16 h, heure de Francfort (≈ 15 h UTC).
  return { eurusd: rate, time: day ? Date.parse(`${day}T15:00:00Z`) : null, source: 'BCE' };
}

async function load() {
  const errors = [];
  try {
    const q = await fromYahoo('EURUSD=X');
    if (num(q.price) && q.price > 0.5 && q.price < 2) return { eurusd: q.price, time: q.lastTime ?? null, source: 'Yahoo Finance', fetchedAt: Date.now() };
    errors.push('Yahoo : taux invalide');
  } catch (err) {
    errors.push(String(err.message || err));
  }
  try {
    return { ...(await fromECB()), fetchedAt: Date.now() };
  } catch (err) {
    errors.push(String(err.message || err));
  }
  throw new Error(errors.join(' | '));
}

export async function GET() {
  try {
    return json(await cached('fx', TTL, load), 200, 300);
  } catch (err) {
    return json({ error: 'Taux de change indisponible', detail: String(err.message || err) }, 502);
  }
}
