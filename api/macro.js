// GET /api/macro — matières premières (contrats à terme) et principales paires de devises.
// Source : Yahoo Finance (appels groupés, repli symbole par symbole). Valeur introuvable → null → « n/d ».
import { cached, json } from './_lib.js';
import { BATCH, fromYahoo, mapLimit, parseYahoo, sparkBatch } from './_yahoo.js';

const TTL = 45_000;
const LOGO = (id) => `https://s3-symbol-logo.tradingview.com/${id}.svg`;
// unit : unité de cotation du contrat (spécification de la place de cotation).
export const MACRO = [
  { id: 'gold', group: 'commo', yahoo: 'GC=F', unit: 'oz', logo: 'metal/gold' },
  { id: 'silver', group: 'commo', yahoo: 'SI=F', unit: 'oz', logo: 'metal/silver' },
  { id: 'wti', group: 'commo', yahoo: 'CL=F', unit: 'bbl', logo: 'crude-oil' },
  { id: 'brent', group: 'commo', yahoo: 'BZ=F', unit: 'bbl', logo: 'crude-oil' },
  { id: 'natgas', group: 'commo', yahoo: 'NG=F', unit: 'mmbtu', logo: 'natural-gas' },
  { id: 'copper', group: 'commo', yahoo: 'HG=F', unit: 'lb', logo: 'metal/copper' },
  { id: 'wheat', group: 'commo', yahoo: 'ZW=F', unit: 'bu', logo: 'commodity/wheat' },
  { id: 'eurusd', group: 'fx', yahoo: 'EURUSD=X', pair: ['EUR', 'USD'], logo: 'country/EU' },
  { id: 'gbpusd', group: 'fx', yahoo: 'GBPUSD=X', pair: ['GBP', 'USD'], logo: 'country/GB' },
  { id: 'usdjpy', group: 'fx', yahoo: 'USDJPY=X', pair: ['USD', 'JPY'], logo: 'country/JP' },
  { id: 'usdchf', group: 'fx', yahoo: 'USDCHF=X', pair: ['USD', 'CHF'], logo: 'country/CH' },
  { id: 'audusd', group: 'fx', yahoo: 'AUDUSD=X', pair: ['AUD', 'USD'], logo: 'country/AU' },
  { id: 'usdcad', group: 'fx', yahoo: 'USDCAD=X', pair: ['USD', 'CAD'], logo: 'country/CA' },
  { id: 'usdcny', group: 'fx', yahoo: 'USDCNY=X', pair: ['USD', 'CNY'], logo: 'country/CN' },
  { id: 'usdkrw', group: 'fx', yahoo: 'USDKRW=X', pair: ['USD', 'KRW'], logo: 'country/KR' },
];

const baseOf = (d) => ({ id: d.id, group: d.group, symbol: d.yahoo, unit: d.unit || null, pair: d.pair || null, logo: LOGO(d.logo), logoSmall: LOGO(d.logo) });

async function load() {
  const syms = MACRO.map((d) => d.yahoo);
  const chunks = [];
  for (let i = 0; i < syms.length; i += BATCH) chunks.push(syms.slice(i, i + BATCH));
  const maps = await Promise.all(chunks.map((c) => sparkBatch(c).catch(() => new Map())));
  const batch = new Map(maps.flatMap((m) => [...m]));
  const items = await mapLimit(MACRO, 6, async (d) => {
    try {
      const q = batch.has(d.yahoo) ? parseYahoo(batch.get(d.yahoo)) : await fromYahoo(d.yahoo);
      return { ...baseOf(d), ...q };
    } catch {
      return { ...baseOf(d), price: null, changePct: null, state: 'unknown', spark: null, source: null };
    }
  });
  if (items.every((x) => x.price === null)) throw new Error('Yahoo : aucune donnée');
  return { items, fetchedAt: Date.now(), source: 'Yahoo Finance' };
}

export async function GET() {
  try {
    return json(await cached('macro', TTL, load));
  } catch (err) {
    return json({ error: 'Matières premières et devises indisponibles', detail: String(err.message || err) }, 502);
  }
}
