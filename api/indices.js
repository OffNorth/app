// GET /api/indices — principaux indices boursiers du monde, groupés par région et par pays,
// avec la courbe de la séance.
// Source : Yahoo Finance. Appels groupés (« spark » v7 pour le statut + v8 pour la courbe,
// 20 symboles par appel), puis repli indice par indice (endpoint « chart »), puis Stooq.
// Toute valeur introuvable est renvoyée à null → affichée "n/d" côté client.
import { cached, fetchWithTimeout, json } from './_lib.js';
import { BATCH, fromYahoo as yahooChart, mapLimit, parseYahoo, sparkBatch } from './_yahoo.js';

const TTL = 45_000;

export const INDICES = [
  // Amériques
  { id: 'spx', region: 'ameriques', country: 'États-Unis', name: 'S&P 500', yahoo: '^GSPC', stooq: '^spx' },
  { id: 'ixic', region: 'ameriques', country: 'États-Unis', name: 'Nasdaq Composite', yahoo: '^IXIC', stooq: '^ndq' },
  { id: 'dji', region: 'ameriques', country: 'États-Unis', name: 'Dow Jones', yahoo: '^DJI', stooq: '^dji' },
  { id: 'rut', region: 'ameriques', country: 'États-Unis', name: 'Russell 2000', yahoo: '^RUT' },
  { id: 'tsx', region: 'ameriques', country: 'Canada', name: 'S&P/TSX Composite', yahoo: '^GSPTSE' },
  { id: 'ibov', region: 'ameriques', country: 'Brésil', name: 'Ibovespa', yahoo: '^BVSP' },
  { id: 'ipc', region: 'ameriques', country: 'Mexique', name: 'S&P/BMV IPC', yahoo: '^MXX' },
  { id: 'merval', region: 'ameriques', country: 'Argentine', name: 'S&P Merval', yahoo: '^MERV' },
  // Europe
  { id: 'sx5e', region: 'europe', country: 'Zone euro', name: 'Euro Stoxx 50', yahoo: '^STOXX50E' },
  { id: 'cac', region: 'europe', country: 'France', name: 'CAC 40', yahoo: '^FCHI', stooq: '^cac' },
  { id: 'dax', region: 'europe', country: 'Allemagne', name: 'DAX', yahoo: '^GDAXI', stooq: '^dax' },
  { id: 'ftse', region: 'europe', country: 'Royaume-Uni', name: 'FTSE 100', yahoo: '^FTSE', stooq: '^ukx' },
  { id: 'ibex', region: 'europe', country: 'Espagne', name: 'IBEX 35', yahoo: '^IBEX' },
  { id: 'ftsemib', region: 'europe', country: 'Italie', name: 'FTSE MIB', yahoo: 'FTSEMIB.MI' },
  { id: 'aex', region: 'europe', country: 'Pays-Bas', name: 'AEX', yahoo: '^AEX' },
  { id: 'smi', region: 'europe', country: 'Suisse', name: 'SMI', yahoo: '^SSMI' },
  { id: 'bel20', region: 'europe', country: 'Belgique', name: 'BEL 20', yahoo: '^BFX' },
  { id: 'psi', region: 'europe', country: 'Portugal', name: 'PSI', yahoo: 'PSI20.LS' },
  { id: 'atx', region: 'europe', country: 'Autriche', name: 'ATX', yahoo: '^ATX' },
  { id: 'omx', region: 'europe', country: 'Suède', name: 'OMX Stockholm 30', yahoo: '^OMX' },
  { id: 'osebx', region: 'europe', country: 'Norvège', name: 'Oslo Børs (OSEBX)', yahoo: 'OSEBX.OL' },
  { id: 'wig20', region: 'europe', country: 'Pologne', name: 'WIG20', yahoo: 'WIG20.WA' },
  { id: 'xu100', region: 'europe', country: 'Turquie', name: 'BIST 100', yahoo: 'XU100.IS' },
  // Asie-Pacifique
  { id: 'sse', region: 'asie', country: 'Chine', name: 'Shanghai Composite', yahoo: '000001.SS', stooq: '^shc' },
  { id: 'szse', region: 'asie', country: 'Chine', name: 'Shenzhen Component', yahoo: '399001.SZ' },
  { id: 'csi300', region: 'asie', country: 'Chine', name: 'CSI 300', yahoo: '000300.SS' },
  { id: 'hsi', region: 'asie', country: 'Hong Kong', name: 'Hang Seng', yahoo: '^HSI', stooq: '^hsi' },
  { id: 'n225', region: 'asie', country: 'Japon', name: 'Nikkei 225', yahoo: '^N225' },
  { id: 'kospi', region: 'asie', country: 'Corée du Sud', name: 'KOSPI', yahoo: '^KS11' },
  { id: 'taiex', region: 'asie', country: 'Taïwan', name: 'TAIEX', yahoo: '^TWII' },
  { id: 'nifty', region: 'asie', country: 'Inde', name: 'Nifty 50', yahoo: '^NSEI' },
  { id: 'sensex', region: 'asie', country: 'Inde', name: 'Sensex', yahoo: '^BSESN' },
  { id: 'sti', region: 'asie', country: 'Singapour', name: 'Straits Times (STI)', yahoo: '^STI' },
  { id: 'jkse', region: 'asie', country: 'Indonésie', name: 'IDX Composite', yahoo: '^JKSE' },
  { id: 'klci', region: 'asie', country: 'Malaisie', name: 'FBM KLCI', yahoo: '^KLSE' },
  { id: 'set', region: 'asie', country: 'Thaïlande', name: 'SET', yahoo: '^SET.BK' },
  { id: 'asx200', region: 'asie', country: 'Australie', name: 'S&P/ASX 200', yahoo: '^AXJO' },
  { id: 'nz50', region: 'asie', country: 'Nouvelle-Zélande', name: 'S&P/NZX 50', yahoo: '^NZ50' },
  // Afrique & Moyen-Orient
  { id: 'tasi', region: 'afrique', country: 'Arabie saoudite', name: 'Tadawul (TASI)', yahoo: '^TASI.SR' },
  { id: 'ta125', region: 'afrique', country: 'Israël', name: 'TA-125', yahoo: '^TA125.TA' },
  { id: 'jse40', region: 'afrique', country: 'Afrique du Sud', name: 'JSE Top 40', yahoo: '^J200.JO' },
  { id: 'egx30', region: 'afrique', country: 'Égypte', name: 'EGX 30', yahoo: '^CASE30' },
];

// Repli Stooq : CSV avec en-tête ; on ne lit que les colonnes identifiées par leur nom.
async function fromStooq(def) {
  if (!def.stooq) throw new Error('Stooq: symbole non couvert');
  const csv = await fetchWithTimeout(
    `https://stooq.com/q/l/?s=${encodeURIComponent(def.stooq)}&f=sd2t2ohlcp&h&e=csv`,
    { as: 'text', timeout: 6000 }
  );
  const [head, row] = csv.trim().split(/\r?\n/);
  if (!head || !row) throw new Error('Stooq: CSV vide');
  const cols = head.split(',').map((c) => c.trim().toLowerCase());
  const vals = row.split(',');
  const get = (name) => {
    const i = cols.findIndex((c) => c === name || c.startsWith(name));
    return i >= 0 ? Number(vals[i]) : NaN;
  };
  const price = get('close');
  if (!Number.isFinite(price) || price <= 0) throw new Error('Stooq: N/D');
  const prevRaw = get('prev');
  const prev = Number.isFinite(prevRaw) && prevRaw > 0 ? prevRaw : null;
  const dateStr = vals[cols.indexOf('date')];
  const lastTime = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? Date.parse(`${dateStr}T12:00:00Z`) : null;
  return {
    price,
    prevClose: prev,
    change: prev !== null ? price - prev : null,
    changePct: prev ? ((price - prev) / prev) * 100 : null,
    currency: null,
    lastTime,
    timezone: null,
    state: 'unknown',
    spark: null,
    source: 'Stooq',
  };
}

const baseOf = (def) => ({ id: def.id, region: def.region, country: def.country, name: def.name });

/** Repli indice par indice : endpoint chart de Yahoo, puis Stooq. */
async function loadOne(def) {
  const errors = [];
  for (const provider of [(d) => yahooChart(d.yahoo), fromStooq]) {
    try {
      return { ...baseOf(def), ...(await provider(def)) };
    } catch (err) {
      errors.push(String(err.message || err));
    }
  }
  return { ...baseOf(def), price: null, changePct: null, state: 'unknown', spark: null, source: null, errors };
}

async function load() {
  const chunks = [];
  for (let i = 0; i < INDICES.length; i += BATCH) chunks.push(INDICES.slice(i, i + BATCH).map((d) => d.yahoo));
  const maps = await Promise.all(chunks.map((c) => sparkBatch(c).catch(() => new Map())));
  const batch = new Map(maps.flatMap((m) => [...m]));

  const indices = await mapLimit(INDICES, 6, async (def) => {
    const payload = batch.get(def.yahoo);
    if (payload) {
      try {
        return { ...baseOf(def), ...parseYahoo(payload) };
      } catch {
        /* données du lot inexploitables → repli */
      }
    }
    return loadOne(def);
  });
  if (indices.every((i) => i.price === null)) throw new Error('Aucune source d’indices disponible');
  return { indices, fetchedAt: Date.now() };
}

export async function GET() {
  try {
    return json(await cached('indices', TTL, load));
  } catch (err) {
    return json({ error: 'Données indices indisponibles', detail: String(err.message || err) }, 502);
  }
}
