// Instantané du marché envoyé à un agent IA : données réelles du site, en texte compact.
// Donnée absente → « n/d » (jamais de valeur inventée). Fichier sans dépendance (testable sous Node et Deno).
import { rsi, sma } from './indicators.js';
import { summary, upnl, fxOf } from './paper-engine.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const ND = 'n/d';
const n = (v, d = 2) => (isNum(v) ? (Math.abs(v) >= 1000 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(d) : v.toPrecision(4)) : ND);
const pct = (v) => (isNum(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : ND);
const big = (v) => (isNum(v) ? (v >= 1e12 ? `${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : `${(v / 1e6).toFixed(0)}M`) : ND);
const MACRO_NAME = { gold: 'Or', silver: 'Argent', wti: 'Pétrole WTI', brent: 'Pétrole Brent', natgas: 'Gaz naturel', copper: 'Cuivre', wheat: 'Blé' };
const macroLabel = (m) => (m.pair ? `${m.pair[0]}/${m.pair[1]}` : MACRO_NAME[m.id] || m.id);

/**
 * Registre des actifs tradables (clé « kind:assetId ») à partir des données du site.
 * closed : la place est fermée (ou en pause) → seuls les ordres limite / stop sont acceptés.
 */
export function buildAssets({ crypto, stocks, indices, macro }) {
  const map = new Map();
  const put = (a) => map.set(`${a.kind}:${a.assetId}`, a);
  for (const c of crypto?.coins || []) put({ kind: 'c', assetId: c.id, label: c.symbol, name: c.name, price: c.price, chg: c.changePct, chg7: c.change7d, cap: c.marketCap, ccy: 'USD', closed: false });
  for (const c of stocks?.companies || []) put({ kind: 's', assetId: c.id, label: c.label, name: c.name, price: c.price, chg: c.changePct, cap: c.marketCap, ccy: c.currency || null, closed: c.state !== 'open', country: c.country });
  for (const x of indices?.indices || []) if (!x.outdated) put({ kind: 'i', assetId: x.id, label: x.name, name: x.country, symbol: x.symbol, price: x.price, chg: x.changePct, ccy: x.currency || null, closed: x.state !== 'open' });
  for (const m of macro?.items || []) if (!m.outdated) put({ kind: 'm', assetId: m.id, label: macroLabel(m), name: m.group === 'fx' ? 'Devise' : 'Matière première', symbol: m.symbol, price: m.price, chg: m.changePct, ccy: m.currency || null, closed: m.state !== 'open' });
  return map;
}

/** Indicateurs journaliers (RSI 14, position vs MM 50 / 200, variation 7 j) depuis des bougies [ts, o, h, l, c, v]. */
export function techOf(candles) {
  const bars = (candles || []).filter((x) => isNum(x[4])).map((x) => ({ time: x[0], close: x[4] }));
  if (bars.length < 20) return null;
  const close = bars[bars.length - 1].close;
  const r = rsi(bars).at(-1)?.value;
  const m50 = bars.length >= 50 ? sma(bars, 50).at(-1).value : null;
  const m200 = bars.length >= 200 ? sma(bars, 200).at(-1).value : null;
  const wk = bars.length > 5 ? bars[bars.length - 6].close : null;
  return { rsi: r, vs50: isNum(m50) ? (close / m50 - 1) * 100 : null, vs200: isNum(m200) ? (close / m200 - 1) * 100 : null, chg5d: isNum(wk) ? (close / wk - 1) * 100 : null };
}

/** Texte de l'instantané (message utilisateur de la requête). */
export function buildSnapshot({ assets, rates, sentiment, calendar, tech }, acct, quote, decisions, now = Date.now()) {
  const L = [];
  L.push(`DATE (UTC) : ${new Date(now).toISOString().slice(0, 16).replace('T', ' ')}`);
  L.push('Format des lignes : kind:assetId | libellé | cours (devise) | variation jour (24 h pour les cryptos) | autres colonnes | état de la place.');
  L.push('Seuls les actifs listés ci-dessous sont tradables. « n/d » = donnée indisponible : ne pas l’estimer.');

  const rows = (kind) => [...assets.values()].filter((a) => a.kind === kind);
  const line = (a, extra = '') => `${a.kind}:${a.assetId} | ${a.label}${a.name && a.kind !== 'c' ? ` (${a.name})` : ''} | ${n(a.price)} ${a.ccy || ND} | ${pct(a.chg)}${extra} | ${a.closed ? 'FERMÉ' : 'ouvert'}`;
  L.push('\n## CRYPTOS (100 premières, hors stablecoins ; colonnes : 7 j, capitalisation en $)');
  for (const a of rows('c')) L.push(line(a, ` | 7 j ${pct(a.chg7)} | cap ${big(a.cap)}`));
  L.push('\n## ACTIONS (100 plus grandes capitalisations ; colonnes : capitalisation en $, pays)');
  for (const a of rows('s')) L.push(line(a, ` | cap ${big(a.cap)} | ${a.country || ND}`));
  L.push('\n## INDICES (1 unité = 1 point dans la devise de l’indice)');
  for (const a of rows('i')) L.push(line(a));
  L.push('\n## MATIÈRES PREMIÈRES ET DEVISES');
  for (const a of rows('m')) L.push(line(a));

  L.push('\n## INDICATEURS JOURNALIERS (bougies réelles ; RSI 14, écart au cours de la MM 50 et de la MM 200, variation 5 séances)');
  const tl = Object.entries(tech || {}).filter(([, v]) => v);
  if (!tl.length) L.push(ND);
  for (const [key, v] of tl) L.push(`${key} | RSI ${n(v.rsi, 1)} | vs MM50 ${pct(v.vs50)} | vs MM200 ${pct(v.vs200)} | 5 séances ${pct(v.chg5d)}`);

  L.push('\n## MACRO');
  if (rates?.tenors) L.push(`Taux US : ${rates.tenors.map((t) => `${t.id} ${isNum(t.rate) ? `${t.rate.toFixed(2)}%` : ND}`).join(', ')} ; écart 10 ans − 3 mois ${isNum(rates.spread) ? rates.spread.toFixed(2) : ND} pt (${rates.inverted == null ? ND : rates.inverted ? 'courbe inversée' : 'courbe normale'}).`);
  else L.push(`Taux US : ${ND}`);
  const f = sentiment?.fng?.now;
  L.push(`Fear & Greed crypto : ${f ? `${f.value}/100 (${f.label})` : ND} ; VIX : ${isNum(sentiment?.vix?.price) ? `${sentiment.vix.price.toFixed(2)} (${pct(sentiment.vix.changePct)})` : ND}.`);
  const today = new Date(now).toISOString().slice(0, 10), in7 = new Date(now + 7 * 864e5).toISOString().slice(0, 10);
  const banks = (calendar?.central || []).filter((c) => c.date >= today && c.date <= in7).map((c) => `${c.bank.toUpperCase()} ${c.date}`);
  const earn = (calendar?.earnings || []).filter((e) => e.date >= today && e.date <= in7).slice(0, 25).map((e) => `${e.symbol} ${e.date}${e.time ? ` (${e.time})` : ''}`);
  L.push(calendar ? `Agenda 7 jours — décisions de taux : ${banks.join(', ') || 'aucune'} ; résultats : ${earn.join(', ') || 'aucun'}.` : `Agenda 7 jours : ${ND}.`);

  // Compte de l'agent
  const s = summary(acct, quote);
  L.push('\n## TON COMPTE (argent fictif, en dollars US)');
  L.push(`Valeur ${n(s.equity)} $ | liquidités ${n(acct.cash)} $ | marge engagée ${n(s.margin)} $ | performance depuis le début ${pct(s.pnlPct)} | capital initial ${n(acct.initial)} $`);
  L.push(`Positions ouvertes (${acct.positions.length}) :`);
  if (!acct.positions.length) L.push('aucune');
  for (const p of acct.positions) {
    const q = quote(p);
    const pnl = isNum(q.price) ? Math.max(-p.margin, upnl(p, q.price, fxOf(p, q))) : null;
    L.push(`positionId=${p.id} | ${p.kind}:${p.assetId} ${p.label} | ${p.side} ${p.lev}× | qté ${n(p.qty, 6)} | entrée ${n(p.entry)} | cours ${n(q.price)} | P&L ${isNum(pnl) ? `${n(pnl)} $` : ND} | TP ${n(p.tp)} | SL ${n(p.sl)} | ouverte ${new Date(p.openedAt).toISOString().slice(0, 10)}`);
  }
  L.push(`Ordres en attente (${acct.orders.length}) :`);
  if (!acct.orders.length) L.push('aucun');
  for (const o of acct.orders) L.push(`orderId=${o.id} | ${o.kind}:${o.assetId} ${o.label} | ${o.side} ${o.type} à ${n(o.price)} | qté ${n(o.qty, 6)} | ${o.lev}×`);
  const hist = (acct.history || []).slice(0, 10);
  if (hist.length) {
    L.push('Dernières clôtures :');
    for (const h of hist) L.push(`${new Date(h.closedAt).toISOString().slice(0, 10)} ${h.label} ${h.side} ${h.reason} net ${n(h.net)} $`);
  }
  L.push('\n## TES DERNIÈRES DÉCISIONS (mémoire courte)');
  if (!decisions?.length) L.push('aucune (première décision)');
  for (const d of decisions || []) L.push(`${new Date(d.at).toISOString().slice(0, 16).replace('T', ' ')} — ${d.summary || ND}${d.rejected?.length ? ` (ordres refusés : ${d.rejected.map((r) => r.why).join(' ; ')})` : ''}`);
  return L.join('\n');
}

/** Actifs pour lesquels on calcule les indicateurs : positions, plus fortes variations et plus grosses capitalisations. */
export function techTargets(assets, acct, max = 24) {
  const keys = new Set(acct.positions.map((p) => `${p.kind}:${p.assetId}`));
  const list = [...assets.values()];
  const movers = list.filter((a) => isNum(a.chg)).sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 12);
  const caps = ['c:bitcoin', 'c:ethereum', 'i:spx', 'i:ndx', 'i:cac', 'i:dax', 'm:gold', 'm:brent', 'm:eurusd', 's:NVDA', 's:AAPL', 's:MSFT'];
  for (const a of movers) keys.add(`${a.kind}:${a.assetId}`);
  for (const k of caps) if (assets.has(k)) keys.add(k);
  return [...keys].slice(0, max).map((k) => assets.get(k)).filter(Boolean);
}

/* ---------- Cours (même logique que l'app et que la fonction alerts) ---------- */
const MINOR = { GBp: ['GBP', 100], GBX: ['GBP', 100], ILA: ['ILS', 100], ZAc: ['ZAR', 100], ZAC: ['ZAR', 100], USX: ['USD', 100] };
/**
 * quote(asset) → { price, ok, fx, ccy, chg } : ok = cours frais (source non périmée) et taux de change connu.
 * stale : marque de données anciennes renvoyée par l'API du site.
 */
export function quoteFrom(assets, { fx, stale = {} } = {}) {
  const rates = fx?.rates || {};
  const usdPer = (ccy) => {
    if (!ccy) return null;
    if (ccy === 'USD') return 1;
    const [b, div] = MINOR[ccy] || [ccy, 1];
    if (b === 'USD') return 1 / div;
    const r = rates[b];
    return isNum(r) && r > 0 ? r / div : null;
  };
  return (a) => {
    const x = assets.get(`${a.kind}:${a.assetId}`);
    if (!x || !isNum(x.price) || x.price <= 0) return { price: null, ok: false, fx: null, ccy: null, chg: null };
    const f = usdPer(x.ccy);
    return { price: x.price, ok: !stale[x.kind] && f != null, fx: f, ccy: x.ccy, chg: isNum(x.chg) ? x.chg : null };
  };
}
