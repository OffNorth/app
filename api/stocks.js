// GET /api/stocks — les 25 plus grosses entreprises cotées du monde (capitalisation),
// avec la variation du jour.
// Classement : CSV public de companiesmarketcap.com (mis en cache 1 h ; on ne lit que le début).
// Cours et variation : Yahoo Finance (appels groupés, repli indice par indice).
// Toute valeur introuvable est renvoyée à null → affichée "n/d" côté client.
import { cached, json, num } from './_lib.js';
import { BATCH, fromYahoo, mapLimit, parseYahoo, sparkBatch } from './_yahoo.js';

const TTL = 45_000;
const RANK_TTL = 3600_000;
const LIMIT = 25;
const CSV_URL = 'https://companiesmarketcap.com/?download=csv';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/** Lit seulement les premières lignes du CSV (le fichier complet fait ~800 Ko). */
async function fetchRanking() {
  const res = await fetch(CSV_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} companiesmarketcap.com`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  while ((text.match(/\n/g) || []).length <= LIMIT + 1) {
    const { value, done } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});

  const lines = text.split(/\r?\n/).filter(Boolean);
  const cells = (l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
  const head = cells(lines[0]).map((h) => h.toLowerCase());
  const col = (name) => head.findIndex((h) => h.startsWith(name));
  const [iRank, iName, iSym, iCap, iCountry] = ['rank', 'name', 'symbol', 'marketcap', 'country'].map(col);
  if ([iRank, iName, iSym, iCap].some((i) => i < 0)) throw new Error('CSV: colonnes inattendues');
  const rows = lines.slice(1, LIMIT + 1).map(cells).map((c) => ({
    rank: Number(c[iRank]),
    name: c[iName],
    symbol: c[iSym],
    marketCap: num(Number(c[iCap])),
    country: iCountry >= 0 ? c[iCountry] : null,
  })).filter((r) => r.symbol && r.marketCap);
  if (rows.length < 10) throw new Error('CSV: classement incomplet');
  return { rows, fetchedAt: Date.now() };
}

// Place de cotation Yahoo → place TradingView (+ intervalle si seul le journalier est autorisé).
// null : place bloquée dans le widget gratuit (vérifié nov. 2026) → lien vers tradingview.com seulement.
const TV_EXCHANGES = {
  NMS: ['NASDAQ'], NGM: ['NASDAQ'], NCM: ['NASDAQ'], NAS: ['NASDAQ'],
  NYQ: ['NYSE'], ASE: ['AMEX'], PCX: ['AMEX'],
  PNK: ['OTC'], OQB: ['OTC'], OQX: ['OTC'], OBB: ['OTC'],
  PAR: ['EURONEXT'], AMS: ['EURONEXT'], BRU: ['EURONEXT'], LIS: ['EURONEXT'],
  SHH: ['SSE', 'D'], SHZ: ['SZSE', 'D'], GER: ['XETR', 'D'], EBS: ['SIX', 'D'], BSE: ['BSE', 'D'],
  KSC: ['KRX', null], KOE: ['KRX', null], SAU: ['TADAWUL', null], HKG: ['HKEX', null], TAI: ['TWSE', null],
  LSE: ['LSE', null], JPX: ['TSE', null], TYO: ['TSE', null], NSI: ['NSE', null],
};

function tvFor(exchange, symbol) {
  const map = TV_EXCHANGES[exchange];
  if (!map) return { tv: null };
  const [ex, interval] = map;
  let t = symbol.replace(/\.[A-Z]{1,3}$/, '').replace(/-/g, '.'); // 2222.SR → 2222, BRK-B → BRK.B
  if (ex === 'HKEX') t = t.replace(/^0+/, ''); // 0700.HK → 700
  const sym = `${ex}:${t}`;
  return interval === null ? { tv: null, link: sym } : { tv: sym, interval: interval || undefined, link: sym };
}

/** Libellé court pour la tuile : ticker US, sinon nom court (initiales si trop long). */
function labelOf(symbol, name) {
  if (!symbol.includes('.')) return symbol.replace(/-/g, '.');
  const n = name.replace(/\s*\(.*?\)\s*/g, ' ').trim();
  if (n.length <= 12) return n;
  const words = n.split(/\s+/);
  return words.length > 1 ? words.map((w) => w[0]).join('').toUpperCase() : n.slice(0, 12);
}

const logoURL = (symbol, size) => `https://companiesmarketcap.com/img/company-logos/${size}/${encodeURIComponent(symbol)}.webp`;

async function load() {
  const { rows } = await cached('stocks-ranking', RANK_TTL, fetchRanking);
  const chunks = [];
  for (let i = 0; i < rows.length; i += BATCH) chunks.push(rows.slice(i, i + BATCH).map((r) => r.symbol));
  const maps = await Promise.all(chunks.map((c) => sparkBatch(c).catch(() => new Map())));
  const batch = new Map(maps.flatMap((m) => [...m]));

  const companies = await mapLimit(rows, 6, async (r) => {
    let q = null;
    try {
      q = batch.has(r.symbol) ? parseYahoo(batch.get(r.symbol)) : await fromYahoo(r.symbol);
    } catch {
      try { q = await fromYahoo(r.symbol); } catch { /* cours n/d */ }
    }
    return {
      id: r.symbol,
      rank: r.rank,
      symbol: r.symbol,
      label: labelOf(r.symbol, r.name),
      name: r.name,
      country: r.country,
      marketCap: r.marketCap,
      price: q?.price ?? null,
      currency: q?.currency ?? null,
      change: q?.change ?? null,
      changePct: q?.changePct ?? null,
      state: q?.state ?? 'unknown',
      lastTime: q?.lastTime ?? null,
      timezone: q?.timezone ?? null,
      logo: logoURL(r.symbol, 128),
      logoSmall: logoURL(r.symbol, 64),
      tv: tvFor(q?.exchange, r.symbol),
    };
  });
  if (companies.every((c) => c.price === null)) throw new Error('Cours indisponibles');
  return { companies, fetchedAt: Date.now(), source: 'Yahoo Finance' }; // classement : companiesmarketcap.com (crédité en pied de page)
}

export async function GET() {
  try {
    return json(await cached('stocks', TTL, load));
  } catch (err) {
    return json({ error: 'Données entreprises indisponibles', detail: String(err.message || err) }, 502);
  }
}
