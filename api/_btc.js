// GET /api/btc — réseau Bitcoin (mempool.space) : hauteur de bloc, prochain halving, difficulté, frais, puissance de calcul.
// Le halving a lieu tous les 210 000 blocs. Sa date est une ESTIMATION : blocs restants × 10 minutes (durée cible d'un bloc),
// la durée réelle varie. Donnée indisponible → null (jamais de valeur inventée).
import { cached, fetchWithTimeout, json, num } from './_lib.js';

const BASE = 'https://mempool.space/api';
const HALVING = 210_000;

async function load() {
  const [h, diff, fees, hash] = await Promise.allSettled([
    fetchWithTimeout(`${BASE}/blocks/tip/height`, { timeout: 7000, as: 'text' }),
    fetchWithTimeout(`${BASE}/v1/difficulty-adjustment`, { timeout: 7000 }),
    fetchWithTimeout(`${BASE}/v1/fees/recommended`, { timeout: 7000 }),
    fetchWithTimeout(`${BASE}/v1/mining/hashrate/3d`, { timeout: 7000 }),
  ]);
  const height = h.status === 'fulfilled' ? Number(String(h.value).trim()) : NaN;
  if (!Number.isInteger(height) || height <= 0) throw new Error('mempool.space : hauteur indisponible');
  const epoch = Math.floor(height / HALVING);
  const next = (epoch + 1) * HALVING;
  const remaining = next - height;
  const d = diff.status === 'fulfilled' ? diff.value : null;
  const f = fees.status === 'fulfilled' ? fees.value : null;
  const hr = hash.status === 'fulfilled' ? num(hash.value?.currentHashrate) : null;
  return {
    height,
    halving: {
      nextHeight: next, remainingBlocks: remaining, number: epoch + 1,
      estimatedAt: Date.now() + remaining * 600_000, // 10 min par bloc
      rewardNow: 50 / 2 ** epoch, rewardNext: 50 / 2 ** (epoch + 1),
      progressPct: ((height - epoch * HALVING) / HALVING) * 100,
    },
    difficulty: d ? {
      changePct: num(d.difficultyChange), remainingBlocks: num(d.remainingBlocks), estimatedAt: num(d.estimatedRetargetDate),
      avgBlockSec: num(d.timeAvg) ? d.timeAvg / 1000 : null,
    } : null,
    fees: f ? { fast: num(f.fastestFee), halfHour: num(f.halfHourFee), hour: num(f.hourFee), economy: num(f.economyFee) } : null,
    hashrateEh: hr != null ? hr / 1e18 : null,
    source: 'mempool.space',
    fetchedAt: Date.now(),
  };
}

export async function GET() {
  try {
    return json(await cached('btc', 5 * 60_000, load), 200, 120);
  } catch (err) {
    return json({ error: 'Réseau Bitcoin indisponible', detail: String(err.message || err) }, 502, 0);
  }
}
