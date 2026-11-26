// Marchés — client PWA (vanilla JS, aucune dépendance).
import { getConsent, setConsent, SERVICES } from './consent.js';
import { country, getLang, indexName, HTML_LANG, LANG_LABELS, LANGS, legalPrefix, LOCALES, setLang, t, TV_LOCALE } from './i18n.js';
import { makeSnapshot, makeTradeCard } from './snapshot.js';
import { createPaper, liqPrice } from './paper.js';
import { createTradeChart, INDICATORS, TIMEFRAMES } from './tradechart.js';
import { rsi, sma, volumeRatio } from './indicators.js';
import { createPortfolio } from './portfolio.js';
import { GLOSSARY } from './glossary.js';
import { createAnalysis } from './analysis.js';
import { createComfort } from './comfort.js';
import { createAgents } from './agents.js';
import { createBot } from './bot.js';
const REFRESH_MS = 60_000;
const APP_BUILD = 38; // à garder égal à VERSION ('v38') dans /sw.js
const APP_VERSION = `${APP_BUILD} (25/11/2026)`;
const TABS = ['accueil', 'favoris', 'crypto', 'actions', 'indices', 'compte', 'bot'];
const REGIONS = ['ameriques', 'europe', 'asie', 'afrique', 'carte'];
const MACRO_GROUPS = ['commo', 'fx']; // matières premières, devises (dans l'onglet Indices)
const INDEX_TABS = [...REGIONS, ...MACRO_GROUPS, 'taux']; // + courbe des taux américains
const LEGACY_REGIONS = { chine: 'asie', usa: 'ameriques' }; // anciens liens (avant l'extension au monde entier)
// Anciens liens #europe, #asie… : onglet Indices sur la région demandée.
const regionOf = (x) => (REGIONS.includes(x) ? x : LEGACY_REGIONS[x]);
const initialTab = (x) => (TABS.includes(x) ? x : regionOf(x) ? 'indices' : undefined);
const ND = 'n/d';

const $ = (sel) => document.querySelector(sel);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`marches:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`marches:${k}`, JSON.stringify(v)); } catch { /* quota / mode privé */ } },
};

// Réglages de l'utilisateur (mémorisés sur l'appareil).
const PREF_DEFAULT = { period: '24h', nCrypto: 25, nStocks: 25, cur: 'USD', region: 'europe', chartMode: 'tv', tcTf: '15m', stocksView: 'companies', cryptoView: 'coins', compteView: 'demo', idxView: 'cards' };
const PREF_VALUES = { period: ['1h', '24h', '7d'], nCrypto: [25, 50, 100], nStocks: [25, 50, 100], cur: ['USD', 'EUR'], stocksView: ['companies', 'sectors', 'screener'], cryptoView: ['coins', 'cats'], compteView: ['demo', 'real', 'agents'], idxView: ['cards', 'perf'], region: INDEX_TABS, chartMode: ['tv', 'trade'], tcTf: TIMEFRAMES };
const prefs = { ...PREF_DEFAULT };
for (const [k, v] of Object.entries(store.get('prefs') || {})) if (PREF_VALUES[k]?.includes(v)) prefs[k] = v;
{ const r = regionOf(location.hash.slice(1)) || regionOf(store.get('tab')); if (r) prefs.region = r; }

/* Favoris : { t: 'c' (crypto) | 's' (entreprise) | 'i' (indice), id, label, name, logo, logoSmall }, mémorisés sur l'appareil. */
const favKey = (f) => `${f.t}:${f.id}`;
let favs = (store.get('favs') || []).filter((f) => f && ['c', 's', 'i', 'm'].includes(f.t) && f.id);
const isFav = (f) => favs.some((x) => favKey(x) === favKey(f));
const hasStockFav = () => favs.some((f) => f.t === 's');
function toggleFav(f) {
  favs = isFav(f) ? favs.filter((x) => favKey(x) !== favKey(f)) : [...favs, { ...f, l: favView.list !== 'all' ? favView.list : undefined }];
  store.set('favs', favs);
}
/* Listes de favoris : [{ id, name }] ; chaque favori peut appartenir à une liste (champ l). Affichage : liste et tri choisis. */
let favLists = (store.get('favLists') || []).filter((x) => x && /^[a-z0-9]{4,12}$/.test(x.id) && typeof x.name === 'string').slice(0, 12);
const favView = { list: 'all', sort: 'added', organize: false, ...(store.get('favView') || {}) };
if (favView.list !== 'all' && !favLists.some((x) => x.id === favView.list)) favView.list = 'all';
const saveFavView = () => store.set('favView', { list: favView.list, sort: favView.sort, mode: favView.mode });
/** Taille du classement d'entreprises à charger : 100 si une entreprise est en favori (pour la retrouver). */
const stocksToLoad = () => (hasStockFav() || paper?.exposure().some((x) => x.kind === 's') ? 100 : prefs.nStocks);

const state = {
  fx: store.get('fx'),
  macro: store.get('macro'),
  extra: { c: {}, s: {} }, // actifs trouvés par la recherche (hors des listes principales)
  tab: initialTab(location.hash.slice(1)) || initialTab(store.get('tab')) || 'accueil',
  crypto: store.get('crypto'),
  indices: store.get('indices'),
  stocks: store.get('stocks'),
  offline: { crypto: false, indices: false, stocks: false, fx: false, macro: false, extra: false },
  loading: false,
  lastFetch: 0,
  prevPrices: new Map(),
};

/* ---------- Formatage ---------- */
const loc = () => LOCALES[getLang()];
const nf = (min, max = min) => new Intl.NumberFormat(loc(), { minimumFractionDigits: min, maximumFractionDigits: max });
let NF0, NF1, NF2, timeFmt, timeSecFmt, dateTimeFmt;
function initFormats() {
  NF0 = nf(0); NF1 = nf(1); NF2 = nf(2);
  dateTimeFmt = new Intl.DateTimeFormat(loc(), { dateStyle: 'long', timeStyle: 'short' });
  timeFmt = new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit' });
  timeSecFmt = new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
initFormats();
const pctSign = () => (getLang() === 'fr' ? '\u202f%' : '%');
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function fmtPct(v, digits = 2) {
  if (!isNum(v)) return ND;
  const s = (digits === 1 ? NF1 : NF2).format(Math.abs(v));
  const sign = v > 0.0049 ? '+' : v < -0.0049 ? '−' : '';
  return `${sign}${s}${pctSign()}`;
}
function fmtSigned(v) {
  if (!isNum(v)) return ND;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${NF2.format(Math.abs(v))}`;
}
function fmtLevel(v) { return isNum(v) ? NF2.format(v) : ND; }
/* Devise : les montants des sources sont en dollars ; en euros, on les convertit au taux EUR/USD
   de /api/fx. Sans taux disponible, on reste en dollars (jamais de taux inventé). */
const eurRate = () => (prefs.cur === 'EUR' && isNum(state.fx?.eurusd) && state.fx.eurusd > 0 ? state.fx.eurusd : null);
const curSym = () => (eurRate() ? '€' : '$');
const toCur = (usd) => { const r = eurRate(); return r ? usd / r : usd; };
function fmtPrice(usd) {
  if (!isNum(usd)) return ND;
  const v = toCur(usd);
  const a = Math.abs(v);
  const f = a >= 1000 ? NF0 : a >= 1 ? NF2 : a >= 0.01 ? nf(4) : nf(2, 8);
  return getLang() === 'fr' ? `${f.format(v)}\u00a0${curSym()}` : `${curSym()}${f.format(v)}`;
}
function fmtCap(usd) {
  if (!isNum(usd)) return ND;
  const v = toCur(usd);
  if (getLang() === 'zh') { // 亿 = 10^8, 万亿 = 10^12
    const unit = eurRate() ? '欧元' : '美元';
    return v >= 1e12 ? `${NF2.format(v / 1e12)}万亿${unit}` : `${(v / 1e8 >= 100 ? NF0 : NF1).format(v / 1e8)}亿${unit}`;
  }
  const md = v / 1e9;
  const f = md >= 100 ? NF0 : md >= 10 ? NF1 : NF2;
  return getLang() === 'fr' ? `${f.format(md)}\u00a0Md${curSym()}` : `${curSym()}${f.format(md)}B`;
}
/** Mention de la devise (image téléchargeable, notes). */
function curNote(key = 'cur.eur') {
  const r = eurRate();
  return r ? t(key, { r: nf(4).format(r), src: state.fx.source || ND }) : t('cur.usd');
}

/* Période des variations crypto. */
const PERIOD_FIELD = { '1h': 'change1h', '24h': 'changePct', '7d': 'change7d' };
const PERIOD_MAX = { '1h': 2, '24h': 8, '7d': 20 }; // variation donnant la couleur la plus vive
const periodLabel = () => t(`p.${prefs.period}`);
/** Cryptos affichées : top N choisi, variation de la période choisie (n/d si la source ne la fournit pas). */
function cryptoItems(data) {
  return (data?.coins || []).slice(0, prefs.nCrypto)
    .map((c) => ({ ...c, label: c.symbol, changePct: isNum(c[PERIOD_FIELD[prefs.period]]) ? c[PERIOD_FIELD[prefs.period]] : null }));
}
const stockItems = (data) => (data?.companies || []).slice(0, prefs.nStocks);
function fmtTime(ms, withSec = false) { return isNum(ms) ? (withSec ? timeSecFmt : timeFmt).format(ms) : ND; }
function fmtDay(ms, tz) {
  if (!isNum(ms)) return ND;
  // Année affichée seulement si ce n'est pas l'année en cours (halving, achats anciens…).
  const opts = { weekday: 'short', day: 'numeric', month: 'short', ...(new Date(ms).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) };
  try { return new Intl.DateTimeFormat(loc(), tz ? { ...opts, timeZone: tz } : opts).format(ms); }
  catch { return new Intl.DateTimeFormat(loc(), opts).format(ms); }
}
function sameLocalDay(a, b) { return new Date(a).toDateString() === new Date(b).toDateString(); }
const signClass = (v) => (!isNum(v) ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------- Couleurs (vert/rouge selon l'ampleur) ---------- */
const NEUTRAL = [43, 51, 61], UP = [18, 150, 72], DOWN = [205, 42, 42], NA = [62, 68, 76];
function heat(pct, maxAbs) {
  if (!isNum(pct)) return `rgb(${NA})`;
  const a = Math.abs(pct);
  if (a < 0.05) return `rgb(${NEUTRAL})`;
  const t = Math.min(1, 0.2 + 0.8 * Math.pow(Math.min(a / maxAbs, 1), 0.7));
  const end = pct > 0 ? UP : DOWN;
  const c = NEUTRAL.map((n, i) => Math.round(n + (end[i] - n) * t));
  return `rgb(${c})`;
}

/* ---------- Treemap « squarified » ---------- */
function squarify(items, x, y, w, h) {
  const total = items.reduce((s, it) => s + it.value, 0);
  const scale = (w * h) / total;
  const queue = items.map((it) => ({ ...it, area: it.value * scale }));
  const out = [];
  let row = [];
  const worst = (r, side) => {
    const s = r.reduce((a, b) => a + b.area, 0);
    const max = Math.max(...r.map((i) => i.area)), min = Math.min(...r.map((i) => i.area));
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };
  const place = (r) => {
    const s = r.reduce((a, b) => a + b.area, 0);
    if (w >= h) {
      const cw = s / h; let cy = y;
      for (const it of r) { const ih = it.area / cw; out.push({ ...it, x, y: cy, w: cw, h: ih }); cy += ih; }
      x += cw; w -= cw;
    } else {
      const rh = s / w; let cx = x;
      for (const it of r) { const iw = it.area / rh; out.push({ ...it, x: cx, y, w: iw, h: rh }); cx += iw; }
      y += rh; h -= rh;
    }
  };
  while (queue.length) {
    const side = Math.min(w, h);
    if (!row.length || worst([...row, queue[0]], side) <= worst(row, side)) row.push(queue.shift());
    else { place(row); row = []; }
  }
  if (row.length) place(row);
  return out;
}

/* ---------- Rendu crypto ---------- */
/** Logo d'une crypto : version 50 px pour les petites tailles, 250 px sinon. */
function logoImg(c, size, cls = 'logo') {
  const raw = size <= 22 ? c.logoSmall || c.logo : c.logo || c.logoSmall;
  if (!raw) return '';
  const src = `/api/logo?u=${encodeURIComponent(raw)}`; // relais du site : l'IP du visiteur n'est pas transmise au CDN tiers
  return `<img class="${cls}" src="${esc(src)}" width="${size}" height="${size}" alt="" decoding="async" referrerpolicy="no-referrer">`;
}
// Logo introuvable → on le retire simplement (le symbole reste affiché).
document.addEventListener('error', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.matches('.logo, .chart-logo, .idx-logo, .pt-logo')) e.target.remove();
}, true);

/** Hauteur de la heatmap : remplit l'écran restant, sans être trop plate ni trop haute. */
function sizeTreemap(map) {
  const width = map.clientWidth;
  const top = map.getBoundingClientRect().top + window.scrollY;
  const tabbar = $('.tabbar').offsetHeight;
  const avail = window.innerHeight - top - tabbar - 44;
  const height = Math.round(width > 600 ? Math.max(420, Math.min(avail, width * 0.7)) : Math.min(Math.max(avail, 380, width), width * 1.9));
  map.style.height = `${height}px`;
  return { width, height };
}

/**
 * Heatmap « treemap » générique (cryptos, entreprises).
 * items : { id, label, name, price, changePct, marketCap, logo?, logoSmall? }
 */
/**
 * Taille d'affichage des cryptos : le BTC (et lui seul) est plafonné à BTC_SHARE de la surface,
 * pour laisser plus de place aux autres. Il reste la plus grande tuile ; les autres restent proportionnelles.
 */
const BTC_SHARE = 0.35;
function shrinkBTC(list) {
  const i = list.findIndex((c) => c.id === 'bitcoin' || c.id === 'btc-bitcoin' || c.symbol === 'BTC');
  if (i < 0) return list;
  const others = list.reduce((s, c, j) => (j === i ? s : s + c.value), 0);
  const second = Math.max(0, ...list.filter((_, j) => j !== i).map((c) => c.value));
  const cap = Math.max(second, (others * BTC_SHARE) / (1 - BTC_SHARE));
  if (list[i].value > cap) list[i] = { ...list[i], value: cap, reduced: true };
  return list;
}

/** Variation moyenne pondérée par la capitalisation (entreprises sans variation exclues) ; null si aucune. */
function weightedChange(list) {
  let w = 0, v = 0;
  for (const c of list) if (isNum(c.changePct) && isNum(c.marketCap)) { w += c.marketCap; v += c.marketCap * c.changePct; }
  return w > 0 ? v / w : null;
}
/**
 * Disposition par groupes (secteurs) : les groupes se partagent la surface selon leur capitalisation,
 * puis les entreprises de chaque groupe se partagent celle du groupe. Renvoie { rects, groups }.
 */
function groupedLayout(sorted, groupOf, width, height) {
  const by = new Map();
  for (const c of sorted) { const g = groupOf(c); if (!by.has(g)) by.set(g, []); by.get(g).push(c); }
  const groups = [...by].map(([key, list]) => ({ key, list, value: list.reduce((s, c) => s + c.value, 0) })).sort((a, b) => b.value - a.value);
  const rects = [], boxes = [];
  for (const g of squarify(groups, 0, 0, width, height)) {
    const head = g.w >= 70 && g.h >= 44 ? 18 : 0; // bandeau du nom du secteur s'il y a la place
    const x = g.x + 1.5, y = g.y + 1.5 + head, w = Math.max(0, g.w - 3), h = Math.max(0, g.h - 3 - head);
    if (w > 0 && h > 0) rects.push(...squarify(g.list, x, y, w, h));
    boxes.push({ ...g, head });
  }
  return { rects, groups: boxes };
}

function renderTiles(map, items, { maxAbs, priceText, period, onOpen, resize, groupOf, groupName }) {
  const { width, height } = sizeTreemap(map);
  let sorted = items.filter((c) => isNum(c.marketCap) && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((c) => ({ ...c, value: c.marketCap }));
  if (resize) sorted = resize(sorted);
  const layout = groupOf ? groupedLayout(sorted, groupOf, width, height) : { rects: squarify(sorted, 0, 0, width, height), groups: [] };
  const rects = layout.rects;
  const total = sorted.reduce((s, c) => s + c.marketCap, 0); // parts calculées sur la vraie capitalisation
  const groupsHTML = layout.groups.map((g) => {
    const chg = weightedChange(g.list);
    const share = total ? `${NF1.format((g.value / total) * 100)}${pctSign()}` : '';
    // Largeur limitée : le nom passe avant la variation, puis la part de capitalisation.
    const extra = `${g.w >= 95 ? ` <span>${fmtPct(chg, 1)}</span>` : ''}${g.w >= 160 ? ` <small>${share}</small>` : ''}`;
    return `<div class="tm-group" aria-hidden="true" style="left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px">${g.head
      ? `<span class="tm-group-h" title="${esc(`${groupName(g.key)} ${fmtPct(chg, 1)} · ${share}`)}"><b>${esc(groupName(g.key))}</b>${extra}</span>` : ''}</div>`;
  }).join('');

  map.classList.toggle('grouped', !!groupOf);
  map.innerHTML = groupsHTML + rects.map((r) => {
    const base = Math.sqrt(r.w * r.h);
    let sym = Math.max(10, Math.min(30, base / 4.2));
    sym = Math.min(sym, (r.w - 6) / (Math.max(r.label.length, 2) * 0.68));
    const pct = Math.max(9, Math.min(18, sym * 0.62));
    const px = Math.max(9, Math.min(14, sym * 0.5));
    const minSide = Math.min(r.w, r.h);
    let inner = '';
    // Logo au-dessus du texte s'il y a la hauteur (réduit au besoin), sinon à gauche du libellé.
    const withLogo = (s, textH, maxLogo, minLogo) => {
      const room = Math.floor(r.h - textH - 12);
      if (room >= minLogo) return { top: logoImg(r, Math.min(maxLogo, room)), inline: '' };
      const symW = r.label.length * 0.68 * s;
      if (r.w >= symW + s + 14) return { top: '', inline: logoImg(r, Math.round(s * 0.95)) };
      return { top: '', inline: '' };
    };
    if (r.w >= 64 && r.h >= 58) {
      const L = withLogo(sym, (sym + pct + px) * 1.15, Math.round(Math.min(44, sym * 1.2, r.w * 0.4)), 16);
      inner = `${L.top}<span class="sym" style="font-size:${sym}px">${L.inline}${esc(r.label)}</span><span class="pct" style="font-size:${pct}px">${fmtPct(r.changePct)}</span><span class="px" style="font-size:${px}px">${priceText(r)}</span>`;
    } else if (r.w >= 40 && r.h >= 34) {
      const s = Math.min(sym, 15), p = Math.min(pct, 11);
      const L = withLogo(s, (s + p) * 1.15, Math.round(Math.min(18, r.w * 0.3)), 12);
      inner = `${L.top}<span class="sym" style="font-size:${s}px">${L.inline}${esc(r.label)}</span><span class="pct" style="font-size:${p}px">${fmtPct(r.changePct, 1)}</span>`;
    } else if (r.logo && minSide >= 14) {
      inner = logoImg(r, Math.round(Math.min(minSide * 0.62, 26))); // trop petit pour le texte : logo seul
    } else if (r.w >= 24 && r.h >= 15) {
      inner = `<span class="sym" style="font-size:${Math.max(8, Math.min(sym, 11))}px">${esc(r.label)}</span>`;
    }
    const prev = state.prevPrices.get(r.id);
    const flash = isNum(prev) && isNum(r.price) && prev !== r.price ? ' flash' : '';
    const aria = `${groupOf ? `${groupName(groupOf(r))} · ` : ''}${r.name} (${r.label}) : ${fmtPct(r.changePct)} ${period}, ${t('priceWord')} ${priceText(r)}`;
    return `<button class="tile${flash}" role="listitem" data-id="${esc(r.id)}" aria-label="${esc(aria)}"
      style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background-color:${heat(r.changePct, maxAbs)}">${inner}</button>`;
  }).join('');
  for (const c of items) state.prevPrices.set(c.id, c.price);

  map.onclick = (e) => {
    const btn = e.target.closest('.tile');
    const i = btn ? sorted.findIndex((x) => x.id === btn.dataset.id) : -1;
    if (i >= 0) onOpen(sorted[i], i + 1, total, sorted.length);
  };
}

function heatmapPlaceholder(statsEl, map) {
  renderTools(map.id === 'treemap' ? 'crypto' : 'stocks');
  statsEl.innerHTML = Array.from({ length: 4 }, () => '<div class="stat skeleton" style="height:58px"></div>').join('');
  map.style.height = '420px';
  map.innerHTML = state.loading ? '<div class="skeleton" style="position:absolute;inset:0"></div>'
    : `<div class="empty" style="position:absolute;inset:0;display:grid;place-items:center">${t('noData')}</div>`;
}

/* Statistiques au-dessus des heatmaps : { label, value (texte ou segments colorés), sub, cls } — page et image. */
function statHTML(s) {
  const value = Array.isArray(s.value)
    ? s.value.map((g) => (g.cls ? `<span class="${g.cls}">${esc(g.text)}</span>` : esc(g.text))).join('')
    : esc(s.value);
  return `<div class="stat"><div class="stat-label">${esc(s.label)}</div>
      <div class="stat-value">${value}</div><div class="stat-sub ${s.cls || ''}">${s.clock ? cdHTML(s.clock, 'stat-cd') : esc(s.sub || '')}</div></div>`;
}
function upDown(list) {
  const up = list.filter((c) => isNum(c.changePct) && c.changePct > 0).length;
  const down = list.filter((c) => isNum(c.changePct) && c.changePct < 0).length;
  const na = list.filter((c) => !isNum(c.changePct)).length;
  return { label: t('upDown'), value: [{ text: `▲ ${up}`, cls: 'pos' }, { text: ' · ' }, { text: `▼ ${down}`, cls: 'neg' }],
    sub: `${t('inTop25', { n: list.length })}${na ? ` · ${na} ${ND}` : ''}` };
}
const updated = (data) => ({ label: t('updated'), value: fmtTime(data.fetchedAt, true), sub: `${data.source || ND}${data.stale ? ` · ${t('stale')}` : ''}` });

function cryptoStats(data) {
  const g = data.global || {};
  return [
    { label: t('totalCap'), value: fmtCap(g.totalMarketCap), sub: `${fmtPct(g.totalChangePct)} ${t('over24h')}`, cls: signClass(g.totalChangePct) },
    { label: t('btcDom'), value: isNum(g.btcDominance) ? `${NF1.format(g.btcDominance)}${pctSign()}` : ND, sub: t('ofCap') },
    upDown(cryptoItems(data)),
    updated(data),
  ];
}

function renderCrypto() {
  const data = state.crypto;
  const statsEl = $('#crypto-stats'), map = $('#treemap');
  if (!data?.coins?.length) return heatmapPlaceholder(statsEl, map);
  renderTools('crypto');
  statsEl.innerHTML = cryptoStats(data).map(statHTML).join('');
  if (prefs.cryptoView === 'cats') { $('#btc-net').innerHTML = ''; return renderCryptoCats(map); }
  analysis.renderBtc($('#btc-net'));
  renderTiles(map, cryptoItems(data), {
    maxAbs: PERIOD_MAX[prefs.period], period: t('period24h', { p: periodLabel() }), priceText: (c) => fmtPrice(c.price), onOpen: openChart, resize: shrinkBTC,
  });
  renderMovers($('#crypto-movers'), cryptoItems(data), (c) => fmtPrice(c.price), openCryptoRanked, t('movers.period', { p: periodLabel() }));
}

/** Cours d'une action dans sa devise (symbole $ pour l'USD). */
function fmtStockPrice(v, cur) {
  if (!isNum(v)) return ND;
  if (!cur || cur === 'USD') return fmtPrice(v);
  return `${(Math.abs(v) >= 10000 ? NF0 : NF2).format(v)}\u00a0${esc(cur)}`;
}

function stocksStats(data) {
  const list = stockItems(data);
  const total = list.reduce((s, c) => s + (isNum(c.marketCap) ? c.marketCap : 0), 0);
  const us = list.find((c) => /^(NASDAQ|NYSE):/.test(c.tv?.link || ''));
  const usState = us ? statusOf(us) : null;
  return [
    { label: t('top25cap', { n: list.length }), value: fmtCap(total), sub: t('hourly') },
    { label: t('wallStreet'), value: usState ? usState.chip : ND, sub: usState ? usState.foot : '', clock: us ? marketClock(us) : null },
    upDown(list),
    updated(data),
  ];
}

function renderStocks() {
  const data = state.stocks;
  const statsEl = $('#stocks-stats'), map = $('#treemap-stocks');
  if (!data?.companies?.length) return heatmapPlaceholder(statsEl, map);
  renderTools('stocks');
  statsEl.innerHTML = stocksStats(data).map(statHTML).join('');
  const screen = prefs.stocksView === 'screener';
  map.hidden = screen;
  $('#stocks-movers').hidden = screen;
  $('#screener').hidden = !screen;
  if (screen) { $('#stocks-sector-src').hidden = true; if (!state.sectors) loadSectors(); return renderScreener($('#screener'), data); }
  const bySector = prefs.stocksView === 'sectors';
  if (bySector && !state.sectors) loadSectors();
  const sec = state.sectors?.sectors || {};
  renderTiles(map, stockItems(data), {
    maxAbs: 4, period: t('periodSession'), priceText: (c) => fmtStockPrice(c.price, c.currency), onOpen: openStockChart,
    ...(bySector && state.sectors ? { groupOf: (c) => sec[c.id] || 'other', groupName: sectorName } : {}), // secteurs pas encore chargés : vue simple
  });
  renderMovers($('#stocks-movers'), stockItems(data), (c) => fmtStockPrice(c.price, c.currency), openStockRanked, t('movers.session'));
  const src = $('#stocks-sector-src');
  src.hidden = !bySector;
  if (bySector) src.textContent = state.sectors ? t('sector.src', { s: state.sectors.source, d: fmtDay(Date.parse(state.sectors.generatedAt)) }) : t('loading');
}
/** Secteurs d'activité des entreprises suivies : fichier statique généré par scripts/sectors.mjs (classement Yahoo Finance). */
let sectorsLoading = false;
async function loadSectors() {
  if (sectorsLoading) return;
  sectorsLoading = true;
  try {
    const r = await fetch('/data/sectors.json');
    if (r.ok) state.sectors = await r.json();
  } catch { /* hors ligne : entreprises affichées dans « Autre / n/d » */ }
  sectorsLoading = false;
  if (!state.sectors) state.sectors = { sectors: {}, source: ND, generatedAt: null };
  if (state.tab === 'actions') renderStocks();
}
const SECTORS = ['Technology', 'Communication Services', 'Consumer Cyclical', 'Consumer Defensive', 'Financial Services', 'Healthcare',
  'Industrials', 'Energy', 'Basic Materials', 'Real Estate', 'Utilities'];
const sectorName = (k) => (SECTORS.includes(k) ? t(`sector.${k.replace(/\s+/g, '')}`) : k === 'other' ? t('sector.other') : k);

/* ---------- Alertes de prix (notifications push) ----------
 * Le site relaie les demandes vers le service d'alertes (/api/alerts). L'appareil est identifié par un jeton
 * aléatoire gardé dans son stockage local ; aucune requête n'est faite tant que l'utilisateur n'a pas créé d'alerte. */
const ALERT_TOKEN = 'alertsToken';
let alertsCache = null;
let vapidKey = null;
let alertAsset = null;

/** Montant dans la devise de la source (les seuils d'alerte ne sont pas convertis en euros). */
function fmtNative(v, cur) {
  if (!isNum(v)) return ND;
  if (!cur) return `${NF2.format(v)}\u00a0${t('alert.points')}`;
  const a = Math.abs(v);
  const f = a >= 1000 ? NF0 : a >= 1 ? NF2 : a >= 0.01 ? nf(4) : nf(2, 8);
  if (cur === 'USD') return getLang() === 'fr' ? `${f.format(v)}\u00a0$` : `$${f.format(v)}`;
  return `${f.format(v)}\u00a0${esc(cur)}`;
}
/** Nombre saisi : accepte « 70 000 », « 70000,5 », « 70,000.5 »… */
function parseAmount(raw) {
  let s = String(raw).trim().replace(/[\s\u00a0\u202f'’$€]/g, '');
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c >= 0 && d >= 0) s = (c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  else if (c >= 0) s = getLang() !== 'fr' && /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (d >= 0 && getLang() === 'fr' && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return /^\d*\.?\d+$/.test(s) ? Number(s) : NaN;
}
async function alertsApi(action, extra = {}) {
  const res = await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status, body });
  return body;
}
/** Relie (ou non) cet appareil au compte démo synchronisé, pour recevoir les notifications d'exécution. */
async function linkDevice(code, on) {
  if (on) {
    const sup = pushSupport();
    if (sup !== 'ok') throw Object.assign(new Error(sup), { status: 0 });
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (perm !== 'granted') { toast(t('alert.denied'), 'neg'); throw Object.assign(new Error('denied'), { status: 0 }); }
  }
  const token = on ? await ensureDevice() : store.get(ALERT_TOKEN);
  if (!token) return;
  await alertsApi('paper.link', { code, device: token, on });
}
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (ch) => ch.charCodeAt(0));
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function pushSupport() {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios ? 'ios' : 'unsupported';
}
async function loadAlerts(force = false) {
  const token = store.get(ALERT_TOKEN);
  if (!token) return (alertsCache = { alerts: [], at: Date.now() });
  if (alertsCache && !force && Date.now() - alertsCache.at < 30_000) return alertsCache;
  try {
    const r = await alertsApi('list', { token });
    alertsCache = { alerts: r.alerts || [], summary: r.summary || null, at: Date.now() };
  } catch {
    alertsCache = { alerts: alertsCache?.alerts || [], summary: alertsCache?.summary || null, at: Date.now(), error: true };
  }
  return alertsCache;
}
/** Abonnement push du navigateur + enregistrement de l'appareil (après accord pour les notifications). */
async function ensureDevice() {
  if (!vapidKey) vapidKey = (await alertsApi('config')).publicKey;
  const key = fromB64url(vapidKey);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const old = sub?.options?.applicationServerKey;
  if (sub && old && new Uint8Array(old).join() !== key.join()) { await sub.unsubscribe(); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  let token = store.get(ALERT_TOKEN);
  if (!token) { token = newToken(); store.set(ALERT_TOKEN, token); }
  await alertsApi('register', { token, sub: sub.toJSON(), lang: getLang() });
  return token;
}

const alertWindow = (kind) => t(kind === 'c' ? 'alert.w24' : 'alert.wDay');
function alertLine(a) {
  const pct = a.metric === 'pct';
  const val = (v) => (a.metric === 'rsi' || a.metric === 'vol' ? NF1.format(v) : a.metric === 'ma' ? fmtNative(v, a.currency) : pct ? fmtPct(v) : fmtNative(v, a.currency));
  const cond = a.metric === 'rsi' ? `${esc(a.label)} · RSI 14 ${a.direction === 'above' ? '≥' : '≤'} ${NF1.format(a.target)} <small>(${t('alert.daily')})</small>`
    : a.metric === 'ma' ? `${esc(a.label)} · ${t(a.direction === 'above' ? 'alert.maUp' : 'alert.maDown')} <small>(${t('alert.daily')})</small>`
    : a.metric === 'vol' ? `${esc(a.label)} · ${t('alert.volX', { v: NF1.format(a.target) })} <small>(${t('alert.daily')})</small>`
    : `${esc(a.label)} ${a.direction === 'above' ? '≥' : '≤'} ${val(a.target)}${pct ? ` <small>(${alertWindow(a.kind)})</small>` : ''}`;
  const st = a.triggeredAt
    ? t('alert.fired', { d: fmtDay(Date.parse(a.triggeredAt)), p: val(a.triggeredPrice) })
    : t('alert.active');
  return `<li class="${a.triggeredAt ? 'fired' : ''}"><span class="alert-cond">${cond}</span><span class="alert-state">${st}</span>
    <button type="button" class="alert-del" data-del="${esc(a.id)}" aria-label="${esc(t('alert.delete'))} : ${esc(a.label)}">✕</button></li>`;
}
function bindDeletes(root, after) {
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try { await alertsApi('delete', { token: store.get(ALERT_TOKEN), id: b.dataset.del }); } catch { b.disabled = false; return; }
    await loadAlerts(true);
    after();
  }));
}
function renderAlertList() {
  const box = $('#alert-list');
  const mine = (alertsCache?.alerts || []).filter((a) => alertAsset && a.kind === alertAsset.kind && a.assetId === alertAsset.assetId);
  box.innerHTML = mine.length ? `<h3>${t('alert.forAsset')}</h3><ul class="alert-items">${mine.map(alertLine).join('')}</ul>` : '';
  bindDeletes(box, () => { renderAlertList(); if (state.tab === 'favoris') renderFavAlerts(); });
}
async function renderFavAlerts() {
  const box = $('#fav-alerts');
  if (!store.get(ALERT_TOKEN)) { box.innerHTML = ''; return; }
  const { alerts, error } = await loadAlerts();
  box.innerHTML = `<h2>${t('alert.mine')}</h2>
    ${error ? `<p class="alert-msg">${t('alert.error')}</p>` : ''}
    ${alerts.length ? `<ul class="alert-items">${alerts.map(alertLine).join('')}</ul>` : `<p class="consent-small">${t('alert.none')}</p>`}
    <button type="button" class="btn btn-sm" id="alerts-forget">${t('alert.forget')}</button>`;
  bindDeletes(box, renderFavAlerts);
  $('#alerts-forget').onclick = async () => {
    if (!confirm(t('alert.forgetConfirm'))) return;
    try { await alertsApi('forget', { token: store.get(ALERT_TOKEN) }); } catch { /* le serveur supprimera l'appareil inactif */ }
    try { await (await (await navigator.serviceWorker.ready).pushManager.getSubscription())?.unsubscribe(); } catch { /* rien */ }
    try { localStorage.removeItem(`marches:${ALERT_TOKEN}`); } catch { /* rien */ }
    alertsCache = null;
    renderFavAlerts();
  };
}

function alertMsg(key, vars) {
  const m = $('#alert-msg');
  m.innerHTML = key ? t(key, vars) : '';
  m.hidden = !key;
}
let alertMetric = 'price'; // 'price' : seuil de cours ; 'pct' : seuil de variation (24 h pour une crypto, séance sinon) ; 'tech' : indicateur
const TECH_KINDS = ['rsiAbove', 'rsiBelow', 'maUp', 'maDown', 'vol'];
/** Pourcentage signé saisi (« -5 », « −2,5 », « +3 % »). */
function parseSigned(raw) {
  const s = String(raw).trim().replace(/[%\s\u00a0\u202f]/g, '');
  const neg = /^[-−–]/.test(s);
  const v = parseAmount(s.replace(/^[-−–+]/, ''));
  return isNum(v) ? (neg ? -v : v) : NaN;
}
function setAlertMetric(m) {
  const a = alertAsset;
  alertMetric = m;
  for (const b of document.querySelectorAll('#alert-mode [data-metric]')) b.setAttribute('aria-pressed', String(b.dataset.metric === m));
  const techBox = $('#alert-tech');
  techBox.hidden = m !== 'tech';
  $('#alert-target').closest('.alert-input').hidden = false;
  if (m === 'tech') return setTechKind($('#alert-tech-kind').value || 'rsiAbove');
  const pct = m === 'pct';
  $('#alert-title').textContent = t(pct ? 'alert.titlePct' : 'alert.title', { l: a.label });
  $('#alert-label').textContent = pct ? t('alert.targetPct', { w: alertWindow(a.kind) }) : t('alert.target');
  $('#alert-now').textContent = pct ? t('alert.nowPct', { v: isNum(a.chg) ? fmtPct(a.chg) : ND, w: alertWindow(a.kind) }) : t('alert.now', { p: fmtNative(a.price, a.currency) });
  $('#alert-unit').textContent = pct ? '%' : a.currency === 'USD' ? '$' : a.currency || t('alert.points');
  $('#alert-note').textContent = pct ? t('alert.pctNote') : a.currency === 'USD' && eurRate() ? t('alert.usdNote') : '';
  const input = $('#alert-target');
  input.value = '';
  input.inputMode = pct ? 'text' : 'decimal';
  input.placeholder = pct ? t('alert.pctPh') : isNum(a.price) ? NF2.format(a.price) : '';
  $('#alert-dir').textContent = '';
  const ok = pct ? isNum(a.chg) : isNum(a.price);
  alertMsg(ok ? null : pct ? 'alert.noChg' : 'alert.noPrice');
  $('#alert-submit').disabled = !ok;
}
/** Mode « Technique » : RSI 14, croisement MM20 / MM50 ou volume, sur bougies journalières (vérifié par le serveur). */
function setTechKind(k) {
  const a = alertAsset;
  $('#alert-tech-kind').value = k;
  $('#alert-title').textContent = t('alert.titleTech', { l: a.label });
  $('#alert-now').textContent = t('alert.techNow');
  const input = $('#alert-target');
  const box = input.closest('.alert-input');
  box.hidden = k === 'maUp' || k === 'maDown';
  input.value = k === 'rsiAbove' ? '70' : k === 'rsiBelow' ? '30' : k === 'vol' ? '2' : '';
  input.inputMode = 'decimal';
  input.placeholder = '';
  $('#alert-label').textContent = t(k.startsWith('rsi') ? 'alert.rsiLabel' : k === 'vol' ? 'alert.volLabel' : 'alert.maLabel');
  $('#alert-unit').textContent = k === 'vol' ? '×' : '';
  $('#alert-note').textContent = t(`alert.techNote.${k.startsWith('rsi') ? 'rsi' : k === 'vol' ? 'vol' : 'ma'}`);
  $('#alert-dir').textContent = '';
  const noSym = (a.kind === 'i' || a.kind === 'm') && !a.symbol;
  alertMsg(noSym ? 'alert.techNa' : null);
  $('#alert-submit').disabled = noSym;
}
function updateAlertDir() {
  const a = alertAsset;
  const out = $('#alert-dir');
  if (alertMetric === 'tech') { out.textContent = ''; return; }
  if (alertMetric === 'pct') {
    const v = parseSigned($('#alert-target').value);
    out.textContent = isNum(v) && v !== 0 ? t(v > 0 ? 'alert.pctAbove' : 'alert.pctBelow', { t: fmtPct(v), w: alertWindow(a?.kind) }) : '';
    return;
  }
  const v = parseAmount($('#alert-target').value);
  if (!isNum(v) || !isNum(a?.price) || v === a.price) { out.textContent = ''; return; }
  out.textContent = t(v > a.price ? 'alert.above' : 'alert.below', { t: fmtNative(v, a.currency) });
}
async function openAlert(a) {
  alertAsset = a;
  $('#alert-mode').setAttribute('aria-label', t('alert.mode'));
  setAlertMetric('price');
  const input = $('#alert-target');
  $('#alert-info').innerHTML = t('alert.info', { link: `<a href="${legalPrefix()}/confidentialite.html#alertes">${t('alert.privacy')}</a>` });
  $('#alert-list').innerHTML = '';
  $('#alert').hidden = false;
  input.focus();
  if (store.get(ALERT_TOKEN)) { await loadAlerts(); renderAlertList(); }
}
function closeAlert() {
  $('#alert').hidden = true;
  alertAsset = null;
}
$('#alert-close').addEventListener('click', closeAlert);
$('#alert').addEventListener('click', (e) => { if (e.target.id === 'alert') closeAlert(); });
$('#alert-target').addEventListener('input', updateAlertDir);
for (const b of document.querySelectorAll('#alert-mode [data-metric]')) b.addEventListener('click', () => { if (alertAsset) { setAlertMetric(b.dataset.metric); $('#alert-target').focus(); } });
$('#alert-tech-kind').addEventListener('change', (e) => { if (alertAsset) setTechKind(e.target.value); });
$('#alert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = alertAsset;
  const pct = alertMetric === 'pct', tech = alertMetric === 'tech';
  const techKind = $('#alert-tech-kind').value;
  const target = tech ? (techKind.startsWith('ma') ? 1 : parseAmount($('#alert-target').value)) : pct ? parseSigned($('#alert-target').value) : parseAmount($('#alert-target').value);
  if (!a) return;
  if (tech) {
    if (techKind.startsWith('rsi') && !(isNum(target) && target >= 1 && target <= 99)) return alertMsg('alert.rsiInvalid');
    if (techKind === 'vol' && !(isNum(target) && target >= 1.2 && target <= 50)) return alertMsg('alert.volInvalid');
  } else if (pct) {
    if (!isNum(a.chg)) return alertMsg('alert.noChg');
    if (!isNum(target) || target === 0 || target < -99 || target > 1000) return alertMsg('alert.pctInvalid');
    if (target > 0 ? a.chg >= target : a.chg <= target) return alertMsg('alert.pctReached');
  } else {
    if (!isNum(a.price)) return alertMsg('alert.noPrice');
    if (!isNum(target) || target <= 0) return alertMsg('alert.invalid');
    if (target === a.price) return alertMsg('alert.same');
  }
  const sup = pushSupport();
  if (sup !== 'ok') return alertMsg(sup === 'ios' ? 'alert.ios' : 'alert.unsupported');
  if (!navigator.onLine) return alertMsg('alert.offline');
  // Demande d'autorisation dans le geste de l'utilisateur (obligatoire sur iPhone).
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (perm !== 'granted') return alertMsg('alert.denied');
  const btn = $('#alert-submit');
  btn.disabled = true;
  btn.textContent = t('alert.creating');
  try {
    const token = await ensureDevice();
    await alertsApi('create', { token, alert: tech
      ? { kind: a.kind, assetId: a.assetId, label: a.label, symbol: a.symbol || undefined, currency: null, target,
        metric: techKind.startsWith('rsi') ? 'rsi' : techKind === 'vol' ? 'vol' : 'ma', direction: techKind === 'rsiBelow' || techKind === 'maDown' ? 'below' : 'above' }
      : pct
      ? { kind: a.kind, assetId: a.assetId, label: a.label, metric: 'pct', direction: target > 0 ? 'above' : 'below', target, currency: null }
      : { kind: a.kind, assetId: a.assetId, label: a.label, direction: target > a.price ? 'above' : 'below', target, currency: a.currency } });
    $('#alert-target').value = '';
    $('#alert-dir').textContent = '';
    alertMsg('alert.created');
    await loadAlerts(true);
    if (alertAsset === a) renderAlertList();
    if (state.tab === 'favoris') renderFavAlerts();
  } catch (err) {
    alertMsg(err.status === 409 ? 'alert.limit' : 'alert.error');
  } finally {
    btn.disabled = false;
    btn.textContent = t('alert.create');
  }
});

/* ---------- Image téléchargeable des heatmaps ---------- */
let snapURL = null;
async function openSnapshot(kind) {
  const crypto = kind === 'crypto';
  const data = crypto ? state.crypto : state.stocks;
  const items = crypto ? cryptoItems(data) : stockItems(data);
  const btn = document.querySelector(`[data-snap="${kind}"]`);
  if (!items?.length || btn.disabled) return;
  btn.disabled = true;
  btn.querySelector('span').textContent = t('snap.making');
  try {
    const maxAbs = crypto ? PERIOD_MAX[prefs.period] : 4;
    const vars = { n: items.length, p: periodLabel() };
    const old = state.offline[crypto ? 'crypto' : 'stocks'] || data.stale;
    const blob = await makeSnapshot({
      title: t('appName'),
      subtitle: t(crypto ? 'title.crypto' : 'title.actions', vars),
      when: `${isNum(data.fetchedAt) ? dateTimeFmt.format(data.fetchedAt) : ND}${old ? ` · ${t('stale')}` : ''}`,
      stats: crypto ? cryptoStats(data) : stocksStats(data),
      items,
      layout: squarify,
      resize: crypto ? shrinkBTC : null,
      color: (p) => heat(p, maxAbs),
      fmtPct: (r) => fmtPct(r.changePct),
      priceText: crypto ? (c) => fmtPrice(c.price) : (c) => fmtStockPrice(c.price, c.currency),
      legend: [
        { color: '#b42323', text: t(crypto ? 'legend.down24' : 'legend.down', vars) },
        { color: '#2b333d', text: t('legend.flat') },
        { color: '#15803d', text: t(crypto ? 'legend.up24' : 'legend.upSession', vars) },
      ],
      note: t(crypto ? 'snap.noteCrypto' : 'snap.noteStocks'),
      sources: crypto ? t('snap.srcCrypto', { s: data.source || ND, cur: curNote() })
        : t('snap.srcStocks', { cur: eurRate() ? ` · ${curNote('cur.eurStocks')}` : '' }),
      disclaimer: t('disclaimer'),
      site: location.host,
    });
    const stamp = isNum(data.fetchedAt) ? new Date(data.fetchedAt) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `marches-${crypto ? `crypto-top${items.length}-${prefs.period}` : `entreprises-top${items.length}`}-${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.png`;
    showSnapshot(blob, name);
  } catch {
    btn.querySelector('span').textContent = t('snap.failed');
    setTimeout(() => { btn.querySelector('span').textContent = t('snap.btn'); }, 2500);
    btn.disabled = false;
    return;
  }
  btn.disabled = false;
  btn.querySelector('span').textContent = t('snap.btn');
}

/** Image d'une position du compte démo (ouverte, ou clôturée : entrée d'historique), avec la courbe réelle du cours. */
async function shareTrade(x, closed) {
  try {
    const q = quoteOf(x);
    const d = x.side === 'long' ? 1 : -1;
    const end = closed ? x.closedAt : Date.now();
    const price = closed ? x.exit : q.price;
    let pnl, pct;
    if (closed) {
      pnl = x.net;
      pct = Math.max(-100, (x.exit / x.entry - 1) * d * x.lev * 100);
    } else {
      pnl = isNum(q.price) ? Math.max(-x.margin, (q.price - x.entry) * x.qty * d * paper.fxOf(x, q)) : null;
      pct = pnl == null ? null : (pnl / x.margin) * 100;
    }
    const span = Math.max(end - x.openedAt, 3600_000);
    const tf = span < 2 * 86400_000 ? '15m' : span < 20 * 86400_000 ? '1h' : span < 300 * 86400_000 ? '4h' : '1d';
    let line = [], source = null;
    try {
      const c = await fetchCandles(x, tf);
      const from = x.openedAt - span * 0.15;
      line = (c.candles || []).map((k) => [k[0] * 1000, k[4]]).filter((k) => k[0] >= from && k[0] <= end);
      source = c.source;
    } catch { /* courbe indisponible : image sans courbe */ }
    const P = (v) => priceIn(v, x.kind, x.ccy);
    const marks = [{ value: x.entry, text: `${t('share.entry')} ${P(x.entry)}`, color: '#8d9aab' }];
    if (!closed && isNum(x.tp)) marks.push({ value: x.tp, text: `TP ${P(x.tp)}`, color: '#22c55e' });
    if (!closed && isNum(x.sl)) marks.push({ value: x.sl, text: `SL ${P(x.sl)}`, color: '#f05252' });
    const signedUSD = (v) => (isNum(v) ? `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${fmtNative(Math.abs(v), 'USD')}` : ND);
    const rows = closed
      ? [[t('share.entry'), P(x.entry)], [t('share.exit'), P(x.exit)], [t('share.qty'), qtyNF().format(x.qty)],
        [t('share.lev'), `${x.lev}×`], [t('share.fees'), fmtNative(x.fees, 'USD')], [t('share.duration'), fmtDuration(x.closedAt - x.openedAt)]]
      : [[t('share.entry'), P(x.entry)], [t('share.now'), P(price)], [t('share.qty'), qtyNF().format(x.qty)],
        [t('share.lev'), `${x.lev}× · ${t('share.margin')} ${fmtNative(x.margin, 'USD')}`], ['TP', isNum(x.tp) ? P(x.tp) : '—'], ['SL', isNum(x.sl) ? P(x.sl) : '—']];
    const status = closed
      ? `${t('share.closed', { r: t(`pt.reason.${x.reason}`) })} · ${dateTimeFmt.format(x.closedAt)}`
      : t('share.open', { d: fmtDuration(Date.now() - x.openedAt) });
    const blob = await makeTradeCard({
      title: t('appName'),
      when: dateTimeFmt.format(Date.now()),
      demo: t('share.demo'),
      label: x.label, name: x.name || '', logo: x.logo || x.logoSmall,
      side: x.side, badge: `${x.side === 'long' ? 'LONG' : 'SHORT'} ${x.lev}×`,
      status,
      pnlPct: isNum(pct) ? fmtPct(pct) : ND,
      pnl: signedUSD(pnl),
      cls: !isNum(pnl) || Math.abs(pnl) < 0.005 ? '' : pnl > 0 ? 'pos' : 'neg',
      line, marks, rows,
      noLine: t('share.noLine'),
      sources: t(closed ? 'share.srcClosed' : 'share.srcOpen', { s: source || ND }),
      disclaimer: t('disclaimer'),
      site: location.host,
    });
    const day = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const safe = String(x.label).replace(/[^\w.-]+/g, '').slice(0, 20) || 'position';
    showSnapshot(blob, `marches-demo-${safe}-${x.side}-${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}.png`, 'share.title');
  } catch {
    toast(t('snap.failed'), 'neg');
  }
}

function showSnapshot(blob, name, titleKey = 'snap.title') {
  $('#snap-title').textContent = t(titleKey);
  $('#snap-img').alt = t(titleKey);
  if (snapURL) URL.revokeObjectURL(snapURL);
  snapURL = URL.createObjectURL(blob);
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  const canShare = !!(file && navigator.canShare?.({ files: [file] }));
  $('#snap-img').src = snapURL;
  $('#snap-save').href = snapURL;
  $('#snap-save').download = name;
  const share = $('#snap-share');
  share.hidden = !canShare;
  share.onclick = async () => {
    try { await navigator.share({ files: [file] }); } catch { /* partage annulé */ }
  };
  $('#snap').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#snap-close').focus();
}
function closeSnapshot() {
  if ($('#snap').hidden) return;
  $('#snap').hidden = true;
  $('#snap-img').removeAttribute('src');
  document.body.style.overflow = '';
  if (snapURL) { URL.revokeObjectURL(snapURL); snapURL = null; }
}
for (const b of document.querySelectorAll('[data-snap]')) b.addEventListener('click', () => openSnapshot(b.dataset.snap));
$('#snap-close').addEventListener('click', closeSnapshot);
$('#snap').addEventListener('click', (e) => { if (e.target.id === 'snap') closeSnapshot(); });

/* ---------- Écran graphique TradingView ---------- */
const tvCache = new Map(); // symbole → réponse /api/tv (ou promesse en cours)
let chartToken = 0;

function tvWidgetURL(tvSymbol, interval = '60', opts = {}) {
  let tz = 'Etc/UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* défaut UTC */ }
  const light = opts.dark ? false : isLight();
  const p = new URLSearchParams({
    symbol: tvSymbol, interval, theme: light ? 'light' : 'dark', style: '1', locale: TV_LOCALE[getLang()], timezone: tz,
    toolbarbg: light ? 'eef1f4' : (opts.dark ? '0d1116' : '07090c'), hidesidetoolbar: opts.side ? '0' : '1', symboledit: '0', saveimage: '0', withdateranges: '1',
    hideideas: '1', studies: '[]',
  });
  return `https://s.tradingview.com/widgetembed/?${p}`;
}

function resolveTV(c) {
  const key = `${c.symbol}|${c.name}`;
  if (!tvCache.has(key)) {
    const q = new URLSearchParams({ symbol: c.symbol, name: c.name });
    const p = fetch(`/api/tv?${q}`).then((r) => r.json()).catch(() => ({ tv: null, error: 'réseau' }));
    tvCache.set(key, p);
    p.then((v) => { if (v.error) tvCache.delete(key); }); // on retentera plus tard en cas d'erreur
  }
  return tvCache.get(key);
}

const stat = (label, value, cls = '') =>
  `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value ${cls}">${value}</div></div>`;

/**
 * Ouvre l'écran graphique. `tv` est un objet ou une promesse :
 * { tv: 'EXCHANGE:SYMBOL', interval?, link?, note? } | { tv: null, error? }.
 */
function renderFavBtn(fav) {
  const b = $('#chart-fav');
  const on = isFav(fav);
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', t(on ? 'fav.remove' : 'fav.add'));
  b.title = t(on ? 'fav.remove' : 'fav.add');
}
let chartArgs = null;
async function showChart({ titleHTML, sub, statsHTML, tv, label, missingMsg, fav, alert, trade, learn = null }) {
  const token = ++chartToken;
  chartArgs = { tv, label, missingMsg, alert, trade, token, res: undefined };
  $('#chart-alert').onclick = () => openAlert(alert);
  const tb = $('#chart-trade');
  tb.hidden = !trade;
  tb.onclick = trade ? () => paper.openTicket(trade) : null;
  const favBtn = $('#chart-fav');
  renderFavBtn(fav);
  favBtn.onclick = () => {
    toggleFav(fav);
    renderFavBtn(fav);
    if (fav.t === 's' && (state.stocks?.companies?.length ?? 0) < stocksToLoad()) loadStocks();
    if (state.tab === 'favoris') renderFavs();
  };
  const box = $('#chart'), link = $('#chart-link');
  $('#chart-title').innerHTML = titleHTML;
  $('#chart-sub').textContent = sub;
  $('#chart-stats').innerHTML = statsHTML;
  const learnEl = $('#chart-learn');
  learnEl.hidden = !learn;
  if (learn) learnEl.href = learn;
  renderFacts(trade, token);
  setupNews(trade || alert, token);
  setupAnalyses(trade, token);
  link.hidden = true;
  const modeBox = $('#chart-mode');
  modeBox.hidden = !trade;
  if (box.hidden) {
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    history.pushState({ chart: true }, '');
  }
  // Lien « Ouvrir dans TradingView » : résolu dans tous les modes.
  Promise.resolve(tv).then((res) => {
    if (token !== chartToken) return;
    chartArgs.res = res || null;
    const sym = res?.link || res?.tv;
    if (sym) { link.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}`; link.hidden = false; }
  });
  await renderChartFrame();
}

/** Contenu de l'écran graphique selon le mode : widget TradingView ou graphique de trading (démo). */
async function renderChartFrame() {
  const a = chartArgs;
  if (!a) return;
  const frame = $('#chart-frame'), note = $('#chart-note');
  const mode = a.trade && prefs.chartMode === 'trade' ? 'trade' : 'tv';
  if (a.trade) {
    $('#chart-mode').innerHTML = [['tv', t('tc.mode.tv')], ['trade', t('tc.mode.trade')]].map(([v, l]) =>
      `<button type="button" data-cmode="${v}" aria-pressed="${v === mode}">${l}</button>`).join('');
  }
  tradeChart.unmount();
  $('#chart-trade').hidden = !a.trade || mode === 'trade'; // en mode trading, les boutons Acheter / Vendre sont sous le graphique
  frame.classList.toggle('trade', mode === 'trade');
  note.hidden = true;
  if (mode === 'trade') { tradeChart.mount(frame, a.trade); return; }

  frame.innerHTML = `<div class="msg">${t('chartLoading')}</div>`;
  const res = await a.tv;
  if (a.token !== chartToken || $('#chart').hidden || chartArgs !== a || (a.trade && prefs.chartMode === 'trade')) return;
  if (res?.tv) {
    if (res.note) { note.textContent = typeof res.note === 'function' ? res.note() : res.note; note.hidden = false; }
    renderTVFrame(res, a.label, a.token);
  } else if (res?.error) {
    frame.innerHTML = `<div class="msg">${t('chartUnavailable', { off: navigator.onLine ? '' : t('offlineSuffix') })}</div>`;
  } else {
    frame.innerHTML = `<div class="msg">${a.missingMsg}</div>`;
  }
}
$('#chart-mode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmode]');
  if (!b || prefs.chartMode === b.dataset.cmode) return;
  prefs.chartMode = b.dataset.cmode;
  store.set('prefs', prefs);
  renderChartFrame();
});

/**
 * Affiche le widget TradingView seulement si l'utilisateur l'a accepté.
 * Sans choix : panneau de consentement (Accepter / Refuser, même poids visuel).
 * Refus : aucune requête vers TradingView ; le lien « Ouvrir dans TradingView » reste disponible.
 */
function renderTVFrame(res, label, token) {
  if (token !== chartToken || $('#chart').hidden) return;
  mountTV($('#chart-frame'), res.tv, res.interval, label);
}

/** Widget TradingView dans `frame` si accepté ; sinon panneau de consentement (même règles partout, onglet Bot compris). */
function mountTV(frame, tvSymbol, interval, label, opts = {}) {
  const consent = getConsent('tradingview');
  if (consent === true) {
    frame.innerHTML = `<iframe title="TradingView — ${esc(label)}" src="${esc(tvWidgetURL(tvSymbol, interval, opts))}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    return;
  }
  const s = SERVICES.tradingview;
  const lp = legalPrefix();
  frame.innerHTML = consent === false
    ? `<div class="msg consent-box">
        <p>${t('consent.refused')}</p>
        <div class="consent-actions"><button type="button" class="btn" data-consent="accept">${t('consent.allow')}</button></div>
        <p class="consent-small"><a href="${lp}/cookies.html">${t('consent.manage')}</a></p>
      </div>`
    : `<div class="msg consent-box" role="group" aria-labelledby="consent-title">
        <p id="consent-title"><strong>${t('consent.title')}</strong></p>
        <p>${t('consent.body')}</p>
        <div class="consent-actions">
          <button type="button" class="btn" data-consent="refuse">${t('consent.refuse')}</button>
          <button type="button" class="btn" data-consent="accept">${t('consent.accept')}</button>
        </div>
        <p class="consent-small">${t('consent.small', { link: `<a href="${lp}/cookies.html">${t('legal.cookies')}</a>` })} <a href="${esc(s.policy)}" target="_blank" rel="noopener">${t('consent.tvPolicy')}</a> · <a href="${lp}/confidentialite.html">${t('consent.ourPolicy')}</a></p>
      </div>`;
  frame.querySelectorAll('[data-consent]').forEach((b) => b.addEventListener('click', () => {
    setConsent('tradingview', b.dataset.consent === 'accept');
    mountTV(frame, tvSymbol, interval, label, opts);
  }));
}

function openChart(c, rank, totalTop, count) {
  showChart({
    titleHTML: `${logoImg(c, 28, 'chart-logo')}${esc(c.symbol)} <span class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</span>`,
    sub: `${c.name}${rank ? ` · ${t('rank', { n: rank })}` : ''} · ${t('change24', { p: periodLabel() })}`,
    statsHTML: stat(t('price'), fmtPrice(c.price)) + stat(t('cap'), fmtCap(c.marketCap))
      + stat(t('share', { n: count }), isNum(c.marketCap) && totalTop ? `${NF1.format((c.marketCap / totalTop) * 100)}${pctSign()}` : ND),
    tv: resolveTV(c),
    label: c.symbol,
    missingMsg: t('missCrypto', { s: esc(c.symbol) }),
    fav: { t: 'c', id: c.id, label: c.symbol, name: c.name, logo: c.logo, logoSmall: c.logoSmall },
    alert: { kind: 'c', assetId: c.id, label: c.symbol, price: c.price, currency: 'USD', chg: c.changePct },
    trade: { kind: 'c', assetId: c.id, label: c.symbol, name: c.name, logo: c.logo, logoSmall: c.logoSmall },
  });
}

function openStockChart(c, rank, total, count) {
  const st = statusOf(c);
  showChart({
    titleHTML: `${logoImg(c, 28, 'chart-logo')}${esc(c.label)} <span class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</span>`,
    sub: `${c.name}${rank ? ` · ${t('rank', { n: rank })}` : ''}${c.country ? ` · ${country(c.country)}` : ''} · ${st.chip}`,
    statsHTML: stat(t('quote'), fmtStockPrice(c.price, c.currency)) + stat(t('cap'), fmtCap(c.marketCap))
      + stat(t('share', { n: count }), isNum(c.marketCap) && total ? `${NF1.format((c.marketCap / total) * 100)}${pctSign()}` : ND),
    tv: c.tv || { tv: null },
    label: c.label,
    missingMsg: t('missStock', { s: esc(c.name) }),
    fav: { t: 's', id: c.id, label: c.label, name: c.name, logo: c.logo, logoSmall: c.logoSmall },
    alert: { kind: 's', assetId: c.id, label: c.label, price: c.price, currency: c.currency || null, chg: c.changePct },
    trade: { kind: 's', assetId: c.id, label: c.label, name: c.name, logo: c.logo, logoSmall: c.logoSmall },
  });
}

/*
 * Symboles TradingView des indices, vérifiés dans le widget gratuit (nov. 2026).
 * Certains indices officiels y sont bloqués (licence) : on affiche alors un CFD ou un ETF
 * qui le suit, signalé à l'écran, et le lien « Ouvrir dans TradingView » mène à l'indice officiel.
 * Plusieurs indices officiels n'y sont disponibles qu'en journalier (interval: 'D').
 * tv: null → aucun graphique intégrable : seul le lien vers tradingview.com est proposé.
 */
// Les notes sont des fonctions : elles sont traduites au moment de l'affichage.
const CFD = (name) => () => t('cfd', { name });
const ETF = (key) => () => t('etf', { what: t(key) });
const INDEX_TV = {
  // Amériques
  spx: { tv: 'CAPITALCOM:US500', link: 'SP:SPX', note: CFD('S&P 500') },
  ixic: { tv: 'NASDAQ:ONEQ', link: 'NASDAQ:IXIC', note: ETF('etf.ixic') },
  ndx: { tv: 'CAPITALCOM:US100', link: 'NASDAQ:NDX', note: CFD('Nasdaq 100') },
  dji: { tv: 'CAPITALCOM:US30', link: 'DJ:DJI', note: CFD('Dow Jones') },
  rut: { tv: 'CAPITALCOM:RTY', link: 'TVC:RUT', note: CFD('Russell 2000') },
  tsx: { tv: 'TSX:TSX' },
  ibov: { tv: 'BMFBOVESPA:IBOV' },
  ipc: { tv: 'INDEX:ME', interval: 'D', link: 'BMV:ME' },
  merval: { tv: 'INDEX:IAR', interval: 'D', link: 'BCBA:IMV' },
  // Europe
  sx5e: { tv: 'STOXX:SX5E' },
  cac: { tv: 'EURONEXT:PX1' },
  dax: { tv: 'XETR:DAX', interval: 'D' },
  ftse: { tv: 'CAPITALCOM:UK100', link: 'FTSE:UKX', note: CFD('FTSE 100') },
  ibex: { tv: 'BME:IBC' },
  ftsemib: { tv: 'INDEX:FTSEMIB', interval: 'D' },
  aex: { tv: 'EURONEXT:AEX' },
  smi: { tv: 'SIX:SMI', interval: 'D' },
  bel20: { tv: 'EURONEXT:BEL20' },
  psi: { tv: 'EURONEXT:PSI20' },
  atx: { tv: 'VIE:ATX', interval: 'D' },
  omx: { tv: 'OMXSTO:OMXS30' },
  osebx: { tv: 'OSL:OSEBX' },
  wig20: { tv: 'GPW:WIG20', interval: 'D' },
  xu100: { tv: null, link: 'BIST:XU100' },
  // Asie-Pacifique
  sse: { tv: 'SSE:000001', interval: 'D' },
  szse: { tv: 'SZSE:399001' },
  csi300: { tv: 'SSE:000300', interval: 'D' },
  hsi: { tv: 'HSI:HSI', interval: 'D' },
  n225: { tv: 'INDEX:NKY', interval: 'D', link: 'TVC:NI225' },
  kospi: { tv: 'TSX:KORX', link: 'KRX:KOSPI', note: () => t('note.kospi') },
  taiex: { tv: 'INDEX:TAIEX', interval: 'D', link: 'TWSE:TAIEX' },
  nifty: { tv: 'NASDAQ:INDY', link: 'NSE:NIFTY', note: ETF('etf.nifty') },
  sensex: { tv: 'INDEX:SENSEX', interval: 'D', link: 'BSE:SENSEX' },
  sti: { tv: 'INDEX:STI', interval: 'D', link: 'TVC:STI' },
  jkse: { tv: 'IDX:COMPOSITE', interval: 'D' },
  klci: { tv: 'INDEX:KLSE', interval: 'D', link: 'FTSEMYX:FBMKLCI' },
  set: { tv: null, link: 'SET:SET' },
  asx200: { tv: 'CAPITALCOM:AU200', link: 'ASX:XJO', note: CFD('S&P/ASX 200') },
  nz50: { tv: null, link: 'NZX:NZ50G' },
  // Afrique & Moyen-Orient
  tasi: { tv: null, link: 'TADAWUL:TASI' },
  ta125: { tv: 'TASE:TA125' },
  jse40: { tv: 'TICKMILL:AFRICA40', link: 'JSE:J200', note: CFD('JSE Top 40') },
  egx30: { tv: 'EGX:EGX30' },
};

function openIndexChart(ix) {
  const st = statusOf(ix);
  showChart({
    titleHTML: `${logoImg(ix, 28, 'chart-logo')}${esc(indexName(ix))} <span class="${signClass(ix.changePct)}">${fmtPct(ix.changePct)}</span>`,
    sub: `${country(ix.country)} · ${st.chip} · ${st.foot}`,
    statsHTML: stat(t('level'), fmtLevel(ix.price)) + stat(t('change'), fmtSigned(ix.change), signClass(ix.change))
      + stat(t('prevClose'), fmtLevel(ix.prevClose)),
    tv: INDEX_TV[ix.id] || { tv: null },
    label: indexName(ix),
    missingMsg: t('missIndex', { s: esc(indexName(ix)) }),
    fav: { t: 'i', id: ix.id, label: ix.name, name: ix.name, logo: ix.logo, logoSmall: ix.logoSmall },
    alert: { kind: 'i', assetId: ix.id, label: ix.name, price: ix.outdated ? null : ix.price, currency: null, chg: ix.outdated ? null : ix.changePct, symbol: ix.symbol },
    trade: ix.symbol ? { kind: 'i', assetId: ix.id, label: ix.name, name: country(ix.country), symbol: ix.symbol, logo: ix.logo, logoSmall: ix.logoSmall } : null,
    learn: ix.id === 'ndx' ? `${legalPrefix()}/formation.html` : null, // formation NAS100
  });
}

function closeChart() {
  const box = $('#chart');
  if (box.hidden) return;
  chartToken++;
  chartArgs = null;
  tradeChart.unmount();
  box.hidden = true;
  $('#chart-frame').innerHTML = ''; // décharge le widget
  document.body.style.overflow = '';
}
$('#chart-close').addEventListener('click', () => {
  if (history.state?.chart) history.back(); // déclenche popstate → closeChart
  else closeChart();
});
window.addEventListener('popstate', closeChart);

/* ---------- Matières premières et devises ---------- */
const macroById = (id) => (state.macro?.items || []).find((m) => m.id === id) || null;
const macroName = (m) => (m.pair ? `${m.pair[0]}/${m.pair[1]}` : t(`macro.${m.id}`));
/** Cours d'une matière première (devise + unité) ou d'une paire de devises. */
function fmtMacro(m, v = m.price) {
  if (!isNum(v)) return ND;
  if (m.pair) return nf(v >= 100 ? 2 : 4).format(v);
  const n = nf(v >= 1000 ? 0 : 2, v >= 1000 ? 0 : v >= 10 ? 2 : 3).format(v);
  const cur = m.currency === 'USX' ? '¢' : m.currency === 'USD' ? '$' : m.currency || '';
  return `${n}\u00a0${cur}/${t(`unit.${m.unit}`)}`;
}
function macroCardHTML(m, dataId = m.id) {
  const st = statusOf(m);
  return `<article class="idx" data-id="${esc(dataId)}" tabindex="0" role="button" aria-label="${esc(`${macroName(m)} : ${fmtMacro(m)}, ${fmtPct(m.changePct)}. ${t('openChart')}`)}" style="background-color:${heat(m.changePct, m.pair ? 1 : 2.5)}">
      <div class="idx-country">${logoImg(m, 20, 'idx-logo')}<span>${esc(t(`macro.g.${m.group}`))}</span></div>
      <div class="idx-top"><h3>${esc(macroName(m))}</h3><span class="chip ${st.cls}">${st.chip}</span></div>
      <div class="idx-level">${fmtMacro(m)}</div>
      <div class="idx-chg">${fmtPct(m.changePct)}</div>
      ${sparkSVG(m.spark, m.prevClose)}
      <div class="idx-foot">${st.foot}</div>
      ${cdHTML(marketClock(m), 'idx-cd')}
    </article>`;
}
function renderMacro(group) {
  const grid = $(`#grid-${group}`);
  const list = (state.macro?.items || []).filter((m) => m.group === group);
  if (!list.length) {
    grid.innerHTML = state.loading ? Array.from({ length: 4 }, () => '<div class="idx skeleton"></div>').join('') : `<div class="empty" style="grid-column:1/-1">${t('noData')}</div>`;
    return;
  }
  grid.innerHTML = list.map((m) => macroCardHTML(m)).join('');
  grid.onclick = (e) => { const card = e.target.closest('.idx'); const m = card && macroById(card.dataset.id); if (m) openMacroChart(m); };
  grid.onkeydown = (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const card = e.target.closest('.idx'); if (card) { e.preventDefault(); card.click(); } };
}
// Graphiques TradingView vérifiés dans le widget gratuit (nov. 2026). Matières premières : cours au comptant ou CFD.
const MACRO_NOTE = () => t('macro.tvNote');
const MACRO_TV = {
  gold: { tv: 'TVC:GOLD', link: 'COMEX:GC1!', note: MACRO_NOTE }, silver: { tv: 'OANDA:XAGUSD', link: 'COMEX:SI1!', note: MACRO_NOTE },
  wti: { tv: 'TVC:USOIL', link: 'NYMEX:CL1!', note: MACRO_NOTE }, brent: { tv: 'TVC:UKOIL', link: 'ICEEUR:BRN1!', note: MACRO_NOTE },
  natgas: { tv: 'CAPITALCOM:NATURALGAS', link: 'NYMEX:NG1!', note: MACRO_NOTE }, copper: { tv: 'CAPITALCOM:COPPER', link: 'COMEX:HG1!', note: MACRO_NOTE },
  wheat: { tv: 'CAPITALCOM:WHEAT', link: 'CBOT:ZW1!', note: MACRO_NOTE },
  eurusd: { tv: 'FX:EURUSD' }, gbpusd: { tv: 'FX:GBPUSD' }, usdjpy: { tv: 'FX:USDJPY' }, usdchf: { tv: 'FX:USDCHF' },
  audusd: { tv: 'FX:AUDUSD' }, usdcad: { tv: 'FX:USDCAD' }, usdcny: { tv: 'FX_IDC:USDCNY' }, usdkrw: { tv: 'FX_IDC:USDKRW' },
};
function openMacroChart(m) {
  const st = statusOf(m);
  const name = macroName(m);
  showChart({
    titleHTML: `${logoImg(m, 28, 'chart-logo')}${esc(name)} <span class="${signClass(m.changePct)}">${fmtPct(m.changePct)}</span>`,
    sub: `${t(`macro.g.${m.group}`)} · ${st.chip} · ${st.foot}`,
    statsHTML: stat(t('quote'), fmtMacro(m)) + stat(t('change'), fmtSigned(m.change), signClass(m.change)) + stat(t('prevClose'), fmtMacro(m, m.prevClose)),
    tv: MACRO_TV[m.id] || { tv: null },
    label: name,
    missingMsg: t('missIndex', { s: esc(name) }),
    fav: { t: 'm', id: m.id, label: name, name, logo: m.logo, logoSmall: m.logoSmall },
    alert: { kind: 'm', assetId: m.id, label: name, price: m.price, currency: m.currency || null, chg: m.outdated ? null : m.changePct, symbol: m.symbol },
    trade: { kind: 'm', assetId: m.id, label: name, name: t(`macro.g.${m.group}`), symbol: m.symbol, logo: m.logo, logoSmall: m.logoSmall },
  });
}

/* ---------- Recherche de n'importe quel actif ---------- */
let searchTimer = 0, searchSeq = 0;
function openSearch() {
  $('#search').hidden = false;
  document.body.style.overflow = 'hidden';
  const input = $('#search-q');
  input.value = '';
  $('#search-results').innerHTML = `<p class="search-hint">${t('search.hint')}</p>`;
  input.focus();
}
function closeSearch() {
  if ($('#search').hidden) return;
  $('#search').hidden = true;
  if ($('#chart').hidden) document.body.style.overflow = '';
}
async function runSearch(q) {
  const my = ++searchSeq;
  const box = $('#search-results');
  if (q.trim().length < 2) { box.innerHTML = `<p class="search-hint">${t('search.hint')}</p>`; return; }
  box.innerHTML = `<p class="search-hint">${t('loading')}</p>`;
  let res;
  try { res = (await getJSON(`/api/search?q=${encodeURIComponent(q.trim())}`)).body; } catch { res = { error: true }; }
  if (my !== searchSeq) return;
  if (res.error) { box.innerHTML = `<p class="search-hint">${t('search.error')}</p>`; return; }
  const st = res.results.filter((r) => r.kind === 's'), cr = res.results.filter((r) => r.kind === 'c');
  const row = (r, i) => `<li><button type="button" data-i="${i}">${r.kind === 'c' ? logoImg(r, 24, 'pt-logo') : ''}
      <span class="pk-l"><strong>${esc(r.kind === 'c' ? r.symbol : r.symbol)}</strong><small>${esc(r.name)}${r.kind === 's' ? ` · ${esc(r.exchangeName || r.exchange || '')}${r.type === 'ETF' ? ' · ETF' : ''}${r.sector ? ` · ${esc(r.sector)}` : ''}` : r.rank ? ` · ${t('rank', { n: r.rank })}` : ''}</small></span></button></li>`;
  const all = [...st, ...cr];
  box.innerHTML = !all.length ? `<p class="search-hint">${t('pt.noMatch')}</p>`
    : `${st.length ? `<h3>${t('search.stocks')}</h3><ul class="pt-pick">${st.map((r) => row(r, all.indexOf(r))).join('')}</ul>` : ''}
       ${cr.length ? `<h3>${t('search.cryptos')}</h3><ul class="pt-pick">${cr.map((r) => row(r, all.indexOf(r))).join('')}</ul>` : ''}`;
  box.onclick = async (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const r = all[Number(b.dataset.i)];
    b.disabled = true;
    try { await openFound(r); } catch { toast(t('search.error'), 'neg'); b.disabled = false; }
  };
}
/** Ouvre l'écran graphique d'un actif trouvé par la recherche (cours récupéré à la demande). */
async function openFound(r) {
  const [item] = await fetchExtra(r.kind, [r.id]);
  if (!item) throw new Error('n/d');
  if (r.kind === 's') state.extra.s[r.id] = { ...state.extra.s[r.id], name: r.name, label: r.symbol.replace(/\.[A-Z]{1,3}$/, ''), exchangeName: r.exchangeName || r.exchange };
  closeSearch();
  if (r.kind === 'c') { const c = state.extra.c[r.id]; openChart({ ...c, label: c.symbol }, c.rank, null, null); }
  else openStockChart(state.extra.s[r.id], null, null, null);
}
$('#search-open').addEventListener('click', openSearch);
$('#search-close').addEventListener('click', closeSearch);
$('#search').addEventListener('click', (e) => { if (e.target.id === 'search') closeSearch(); });
$('#search-q').addEventListener('input', (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(e.target.value), 350); });

/* ---------- Horaires des bourses : décompte d'ouverture / de fermeture ---------- */
// Week-end local (0 = dimanche) : vendredi-samedi en Arabie saoudite et en Égypte, samedi-dimanche ailleurs.
const WEEKEND = { 'Asia/Riyadh': [5, 6], 'Africa/Cairo': [5, 6] };
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function tzParts(ms, tz) {
  const o = {};
  for (const p of new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(ms)) o[p.type] = p.value;
  return o;
}
const tzOffsetMin = (ms, tz) => { const o = tzParts(ms, tz); return (Date.UTC(+o.year, o.month - 1, +o.day, +o.hour, +o.minute) - Math.floor(ms / 60000) * 60000) / 60000; };
/* Jours fériés des bourses (fichier statique généré par scripts/holidays.py, source exchange_calendars) :
 * { markets: { fuseau: { mic, weekend:[jours], until:'AAAA-MM-JJ', closed:['AAAA-MM-JJ'] } } }. */
let holidays = null;
fetch('/data/holidays.json').then((r) => (r.ok ? r.json() : null)).then((d) => {
  if (!d?.markets) return;
  holidays = d;
  for (const m of Object.values(d.markets)) m.closedSet = new Set(m.closed);
  if (state.tab === 'indices') renderMarketClock();
}).catch(() => { /* hors ligne : décompte estimé (≈) */ });
const ymd = (o) => `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`;
/**
 * Prochain événement de séance d'un marché, d'après la séance du jour donnée par Yahoo.
 * Séance à venir ou en cours : horaires Yahoo. Séance du jour terminée : prochain jour de séance à la même
 * heure locale (heure d'été comprise), en sautant week-ends et jours fériés connus.
 * estimated = true (« ≈ ») si les jours fériés de cette place ne sont pas connus pour la date trouvée.
 */
function marketClock(item, now = Date.now()) {
  const ses = item?.session, tz = item?.timezone;
  if (!ses || !isNum(ses.start) || !isNum(ses.end) || !tz) return null;
  if (now < ses.start) return { kind: 'open', at: ses.start, estimated: false };
  if (now < ses.end && item.state !== 'closed') return { kind: 'close', at: ses.end, estimated: false };
  const cal = holidays?.markets?.[tz];
  const weekend = cal?.weekend || WEEKEND[tz] || [6, 0];
  let t = ses.start, day = null;
  try {
    for (let i = 0; i < 20; i++) {
      const o = tzParts(t, tz);
      day = ymd(o);
      if (t > now && !weekend.includes(WD[o.weekday]) && !cal?.closedSet?.has(day)) break;
      const next = t + 86400_000;
      t = next + (tzOffsetMin(t, tz) - tzOffsetMin(next, tz)) * 60_000; // même heure locale malgré l'heure d'été
    }
  } catch { return null; }
  if (t <= now) return null;
  const known = !!cal && day >= holidays.from && day <= cal.until;
  return { kind: 'open', at: t, estimated: !known };
}
/** Durée lisible : « 2 j 3 h », « 7 h 05 min », « 4 min 12 s ». */
function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const U = (k) => t(`cd.${k}`);
  if (d) return `${d}\u00a0${U('d')} ${h}\u00a0${U('h')}`;
  if (h) return `${h}\u00a0${U('h')} ${String(m).padStart(2, '0')}\u00a0${U('min')}`;
  return `${m}\u00a0${U('min')} ${String(sec).padStart(2, '0')}\u00a0${U('s')}`;
}
function cdText(c) {
  if (!c) return '';
  const left = c.at - Date.now();
  if (left <= 0) return t(c.kind === 'open' ? 'cd.opening' : 'cd.closing');
  return t(c.kind === 'open' ? 'cd.opensIn' : 'cd.closesIn', { d: `${c.estimated ? '≈\u00a0' : ''}${fmtDuration(left)}` });
}
/** Élément HTML d'un décompte, mis à jour chaque seconde. */
function cdHTML(c, cls = 'cd') {
  if (!c) return '';
  return `<span class="${cls} ${c.kind}" data-cd="${c.at}" data-cdk="${c.kind}" data-cde="${c.estimated ? 1 : 0}">${esc(cdText(c))}</span>`;
}
let cdRefreshAsked = 0;
setInterval(() => {
  if (document.hidden) return;
  let passed = false;
  for (const el of document.querySelectorAll('[data-cd]')) {
    const c = { at: Number(el.dataset.cd), kind: el.dataset.cdk, estimated: el.dataset.cde === '1' };
    el.textContent = cdText(c);
    if (c.at <= Date.now()) passed = true;
  }
  // Ouverture ou fermeture atteinte : on recharge les données (au plus une fois par minute) pour mettre le statut à jour.
  if (passed && Date.now() - cdRefreshAsked > 60_000) { cdRefreshAsked = Date.now(); setTimeout(refresh, 15_000); }
}, 1000);

// Grandes places affichées dans le panneau « Ouverture des bourses » (un indice représentatif par place).
const CLOCK_MARKETS = ['spx', 'tsx', 'ibov', 'ftse', 'cac', 'dax', 'smi', 'n225', 'hsi', 'sse', 'kospi', 'nifty', 'asx200', 'tasi', 'jse40'];
let clockExpanded = false;
function renderMarketClock() {
  const box = $('#market-clock');
  const list = (state.indices?.indices || []);
  const rows = CLOCK_MARKETS.map((id) => list.find((i) => i.id === id)).filter(Boolean)
    .map((ix) => ({ ix, c: marketClock(ix) }))
    .filter((r) => r.c)
    .sort((a, b) => (a.c.kind === b.c.kind ? a.c.at - b.c.at : a.c.kind === 'close' ? -1 : 1));
  if (!rows.length) { box.innerHTML = ''; return; }
  const shown = clockExpanded ? rows : rows.slice(0, 5);
  box.innerHTML = `<h2>${t('cd.title')}</h2>
    <ul>${shown.map(({ ix, c }) => `<li class="${c.kind === 'close' ? 'is-open' : ''}">
      <span class="mc-dot" aria-hidden="true"></span>${logoImg(ix, 18, 'idx-logo')}
      <span class="mc-name"><strong>${esc(country(ix.country))}</strong><small>${esc(indexName(ix))}</small></span>
      ${cdHTML(c, 'mc-cd')}</li>`).join('')}</ul>
    ${rows.length > 5 ? `<button type="button" class="mc-more" aria-expanded="${clockExpanded}">${t(clockExpanded ? 'cd.less' : 'cd.more', { n: rows.length })}</button>` : ''}
    ${clockExpanded ? `<p class="mc-note">${t('cd.note')}</p>` : ''}`;
  box.querySelector('.mc-more')?.addEventListener('click', () => { clockExpanded = !clockExpanded; renderMarketClock(); });
}

/* ---------- Agenda : décisions Fed / BCE (pages officielles) et résultats d'entreprises (Nasdaq) : /api/calendar ---------- */
let agenda = null, agendaAt = 0, agendaLoading = false, agendaExpanded = false;
async function loadAgenda() {
  if (agendaLoading) return;
  agendaLoading = true;
  try {
    const r = await fetch('/api/calendar');
    const d = await r.json();
    agenda = r.ok ? d : { error: true };
  } catch { agenda = agenda?.central ? agenda : { error: true }; }
  agendaAt = Date.now();
  agendaLoading = false;
  if (state.tab === 'indices') renderAgenda();
  else if (state.tab === 'accueil') renderHome();
}
const dayMs = (d) => Date.parse(`${d}T12:00:00Z`); // date publiée (AAAA-MM-JJ), sans heure
function inDays(d) {
  const n = Math.round((dayMs(d) - Date.parse(`${new Date().toLocaleDateString('en-CA')}T12:00:00Z`)) / 86_400_000);
  return n <= 0 ? t('ag.today') : n === 1 ? t('ag.tomorrow') : t('ag.inDays', { n });
}
function renderAgenda() {
  const box = $('#agenda');
  if (!agenda || Date.now() - agendaAt > 30 * 60_000) loadAgenda();
  if (!agenda) { box.innerHTML = `<h2>${t('ag.title')}</h2><p class="mc-note">${t('loading')}</p>`; return; }
  if (agenda.error) { box.innerHTML = `<h2>${t('ag.title')}</h2><p class="mc-note">${t('ag.na')}</p>`; return; }
  const day = (d) => fmtDay(dayMs(d), 'UTC');
  const banks = ['fed', 'ecb'].flatMap((b) => agenda.central.filter((x) => x.bank === b).slice(0, agendaExpanded ? 4 : 1))
    .sort((a, b) => a.date.localeCompare(b.date));
  const earn = agenda.earnings || [];
  const shown = agendaExpanded ? earn : earn.slice(0, 3);
  const bankRow = (x) => `<li><span class="ag-badge ${x.bank}">${t(`ag.${x.bank}`)}</span>
      <span class="mc-name"><strong>${t('ag.rate')}${x.sep ? ` <small class="ag-tag">${t('ag.sep')}</small>` : ''}</strong><small>${esc(t(`ag.${x.bank}Long`))}</small></span>
      <span class="ag-when"><b>${day(x.date)}</b><small>${inDays(x.date)}</small></span></li>`;
  const earnRow = (x) => {
    const c = stockById(x.symbol);
    const eps = isNum(x.eps) ? t('ag.eps', { v: getLang() === 'fr' ? `${NF2.format(x.eps)}\u00a0$` : `${x.eps < 0 ? '−' : ''}$${NF2.format(Math.abs(x.eps))}` }) : '';
    const inner = `${c ? logoImg(c, 18, 'idx-logo') : '<span class="ag-badge earn">$</span>'}
      <span class="mc-name"><strong>${esc(x.symbol)} <small class="ag-co">${esc(x.name)}</small></strong><small>${[x.time ? t(`ag.${x.time}`) : '', eps].filter(Boolean).join(' · ')}</small></span>
      <span class="ag-when"><b>${day(x.date)}</b><small>${inDays(x.date)}</small></span>`;
    return c ? `<li><button type="button" class="ag-item" data-sym="${esc(x.symbol)}">${inner}</button></li>` : `<li>${inner}</li>`;
  };
  const okNote = [!agenda.centralOk?.fed ? t('ag.fedNa') : '', !agenda.centralOk?.ecb ? t('ag.ecbNa') : ''].filter(Boolean).join(' ');
  if (!econData) loadEcon();
  if (!divData) loadDividends();
  box.innerHTML = `<h2>${t('ag.title')}</h2>
    <h3>${t('ag.banks')}</h3>
    ${banks.length ? `<ul>${banks.map(bankRow).join('')}</ul>` : `<p class="mc-note">${ND}</p>`}
    ${okNote ? `<p class="mc-note">${okNote}</p>` : ''}
    <h3>${t('ag.earnings')}</h3>
    ${agenda.earnings == null ? `<p class="mc-note">${t('ag.earnNa')}</p>` : shown.length ? `<ul>${shown.map(earnRow).join('')}</ul>` : `<p class="mc-note">${t('ag.earnNone')}</p>`}
    ${econHTML(agendaExpanded)}
    ${divHTML(agendaExpanded)}
    <button type="button" class="mc-more" aria-expanded="${agendaExpanded}">${t(agendaExpanded ? 'cd.less' : 'ag.more', { n: earn.length })}</button>
    ${agendaExpanded ? `<p class="mc-note">${t('ag.note', {
      fed: `<a href="${agenda.sources.fed}" target="_blank" rel="noopener noreferrer">${t('ag.fedLong')}</a>`,
      ecb: `<a href="${agenda.sources.ecb}" target="_blank" rel="noopener noreferrer">${t('ag.ecbLong')}</a>`,
      nasdaq: `<a href="${agenda.sources.earnings}" target="_blank" rel="noopener noreferrer">Nasdaq</a>`,
    })} ${t('econ.note')}</p>` : ''}`;
  box.querySelector('.mc-more').addEventListener('click', () => { agendaExpanded = !agendaExpanded; renderAgenda(); });
  box.querySelectorAll('.ag-item').forEach((b) => b.addEventListener('click', () => { const c = stockById(b.dataset.sym); if (c) openStockRanked(c); }));
}

/* ---------- Rendu indices ---------- */
function sparkSVG(spark, prev) {
  const pts = spark?.points;
  if (!pts || pts.length < 2) return `<div class="spark-empty">${t('sparkNA')}</div>`;
  const t0 = isNum(spark.start) ? spark.start : pts[0][0];
  const t1 = isNum(spark.end) && spark.end > t0 ? spark.end : pts.at(-1)[0];
  const vals = pts.map((p) => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (isNum(prev)) { lo = Math.min(lo, prev); hi = Math.max(hi, prev); }
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const H = 38, PAD = 3;
  const X = (t) => (Math.min(Math.max((t - t0) / (t1 - t0 || 1), 0), 1) * 100).toFixed(2);
  const Y = (v) => (PAD + ((hi - v) / (hi - lo)) * (H - PAD * 2)).toFixed(2);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0])},${Y(p[1])}`).join('');
  const area = `${line}L${X(pts.at(-1)[0])},${H}L${X(pts[0][0])},${H}Z`;
  const base = isNum(prev) ? `<line x1="0" x2="100" y1="${Y(prev)}" y2="${Y(prev)}" stroke="rgba(255,255,255,.45)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>` : '';
  return `<svg class="spark" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="rgba(255,255,255,.12)"/>${base}
    <path d="${line}" fill="none" stroke="rgba(255,255,255,.92)" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}

function statusOf(ix) {
  switch (ix.state) {
    case 'open': return { chip: t('st.open'), cls: 'open', foot: t('st.openFoot', { t: fmtTime(ix.lastTime) }) };
    case 'break': return { chip: t('st.break'), cls: 'break', foot: t('st.breakFoot', { t: sameLocalDay(ix.lastTime, Date.now()) ? fmtTime(ix.lastTime) : fmtDay(ix.lastTime, ix.timezone) }) };
    case 'closed': return ix.outdated
      ? { chip: t('st.outdated'), cls: 'break', foot: t('st.outdatedFoot', { d: fmtDay(ix.lastTime, ix.timezone) }) }
      : { chip: t('st.closed'), cls: 'closed', foot: t('st.closedFoot', { d: fmtDay(ix.lastTime, ix.timezone) }) };
    default: return { chip: t('st.unknown'), cls: 'unknown', foot: isNum(ix.lastTime) ? t('st.quoteOf', { d: fmtDay(ix.lastTime, ix.timezone) }) : t('st.dateNA') };
  }
}

function indexCardHTML(ix, dataId = ix.id) {
  const st = statusOf(ix);
  return `<article class="idx" data-id="${esc(dataId)}" tabindex="0" role="button" aria-label="${esc(`${indexName(ix)}, ${country(ix.country)} : ${fmtLevel(ix.price)}, ${fmtPct(ix.changePct)}. ${t('openChart')}`)}" style="background-color:${heat(ix.changePct, 2.5)}">
      <div class="idx-country">${logoImg(ix, 20, 'idx-logo')}<span>${esc(country(ix.country))}</span></div>
      <div class="idx-top"><h3>${esc(indexName(ix))}</h3><span class="chip ${st.cls}">${st.chip}</span></div>
      <div class="idx-level">${fmtLevel(ix.price)}</div>
      <div class="idx-chg">${fmtPct(ix.changePct)} <span>(${fmtSigned(ix.change)})</span></div>
      ${sparkSVG(ix.spark, ix.prevClose)}
      <div class="idx-foot">${st.foot}</div>
      ${cdHTML(marketClock(ix), 'idx-cd')}
    </article>`;
}

/** Carte d'un favori crypto ou entreprise (même présentation que les indices). */
function assetCardHTML({ key, kicker, f, title, chip, price, pct, maxAbs, foot, clock }) {
  return `<article class="idx" data-id="${esc(key)}" tabindex="0" role="button" aria-label="${esc(`${f.name} (${title}) : ${price}, ${fmtPct(pct)}. ${t('openChart')}`)}" style="background-color:${heat(pct, maxAbs)}">
      <div class="idx-country">${logoImg(f, 20, 'idx-logo')}<span>${esc(kicker)}</span></div>
      <div class="idx-top"><h3>${esc(title)}</h3>${chip ? `<span class="chip ${chip.cls}">${chip.chip}</span>` : ''}</div>
      <div class="idx-name">${esc(f.name)}</div>
      <div class="idx-level">${price}</div>
      <div class="idx-chg">${fmtPct(pct)}</div>
      <div class="idx-foot">${foot}</div>
      ${cdHTML(clock, 'idx-cd')}
    </article>`;
}

/* ---------- Favoris ---------- */
/* ---------- Actifs hors des listes principales (recherche) ---------- */
const coinById = (id, label) => (state.crypto?.coins || []).find((c) => c.id === id)
  || (label ? (state.crypto?.coins || []).find((c) => c.symbol === label) : null) || state.extra.c[id] || null;
const stockById = (id) => (state.stocks?.companies || []).find((c) => c.id === id) || state.extra.s[id] || null;
/** Identifiants à suivre hors des listes : favoris, positions et ordres du compte démo, graphique ouvert. */
function extraNeeded() {
  const need = { c: new Set(), s: new Set() };
  const add = (kind, id, label) => {
    if (kind === 'c' && !(state.crypto?.coins || []).some((c) => c.id === id || c.symbol === label)) need.c.add(id);
    if (kind === 's' && !(state.stocks?.companies || []).some((c) => c.id === id)) need.s.add(id);
  };
  for (const f of favs) add(f.t, f.id, f.label);
  for (const x of paper.exposure()) add(x.kind, x.assetId, x.label);
  if (chartArgs?.trade) add(chartArgs.trade.kind, chartArgs.trade.assetId, chartArgs.trade.label);
  return need;
}
async function fetchExtra(kind, ids) {
  if (!ids.length) return [];
  const r = await getJSON(`/api/quote?kind=${kind}&ids=${ids.map(encodeURIComponent).join(',')}`);
  if (r.body.error) throw new Error(r.body.error);
  state.offline.extra = r.fromCache;
  for (const it of r.body.items) {
    const prev = state.extra[kind][it.id] || {};
    state.extra[kind][it.id] = { ...prev, ...it, name: prev.name || it.name, label: kind === 'c' ? it.symbol : prev.label || it.label, extra: true };
  }
  return r.body.items;
}
async function refreshExtra() {
  const need = extraNeeded();
  try { await Promise.all([fetchExtra('c', [...need.c]), fetchExtra('s', [...need.s])]); } catch { state.offline.extra = true; }
}

function findCoin(f) {
  const coins = state.crypto?.coins || [];
  const i = coins.findIndex((c) => c.id === f.id);
  return i >= 0 ? i : coins.findIndex((c) => c.symbol === f.label); // id différent selon la source (CoinGecko / CoinPaprika)
}
/** Favoris de la liste affichée, triés selon le choix (variation : celle affichée par l'app ; n/d en dernier). */
function visibleFavs() {
  let list = favView.list === 'all' ? [...favs] : favs.filter((f) => f.l === favView.list);
  const chg = (f) => quoteOf({ kind: f.t, assetId: f.id, label: f.label }).chg;
  if (favView.sort === 'name') list.sort((a, b) => a.label.localeCompare(b.label));
  else if (favView.sort === 'chgDesc' || favView.sort === 'chgAsc') {
    const dir = favView.sort === 'chgDesc' ? -1 : 1;
    list.sort((a, b) => { const x = chg(a), y = chg(b); if (!isNum(x)) return 1; if (!isNum(y)) return -1; return (x - y) * dir; });
  }
  return list;
}
function renderFavTools() {
  const box = $('#fav-tools');
  box.innerHTML = `<div class="fav-lists" role="group" aria-label="${esc(t('fav.lists'))}">
      ${[['all', t('fav.all')], ...favLists.map((x) => [x.id, x.name])].map(([id, name]) =>
        `<button type="button" class="chip-btn" data-flist="${esc(id)}" aria-pressed="${favView.list === id}">${esc(name)}</button>`).join('')}
      <button type="button" class="chip-btn" data-fact="new">+ ${t('fav.newList')}</button></div>
    <div class="fav-row"><label for="fav-sort" class="pt-label">${t('fav.sort')}</label>
      <select id="fav-sort" class="lang-select">${[['added', t('fav.sort.added')], ['chgDesc', t('fav.sort.chgDesc')], ['chgAsc', t('fav.sort.chgAsc')], ['name', t('fav.sort.name')]]
        .map(([v, l]) => `<option value="${v}"${favView.sort === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <div class="seg" role="group" aria-label="${esc(t('tools.view'))}">${[['cards', t('fav.cards')], ['table', t('fav.table')], ['corr', t('corr.btn')]].map(([v, l]) =>
        `<button type="button" data-fmode="${v}" aria-pressed="${(favView.mode || 'cards') === v}">${esc(l)}</button>`).join('')}</div>
      <button type="button" class="btn btn-sm" data-fact="organize" aria-pressed="${favView.organize}">${t(favView.organize ? 'fav.done' : 'fav.organize')}</button></div>`;
  box.onclick = (e) => {
    const l = e.target.closest('[data-flist]');
    if (l) { favView.list = l.dataset.flist; saveFavView(); renderFavs(); return; }
    const a = e.target.closest('[data-fact]');
    if (a?.dataset.fact === 'organize') { favView.organize = !favView.organize; renderFavs(); }
    const fm = e.target.closest('[data-fmode]');
    if (fm) { favView.mode = fm.dataset.fmode; saveFavView(); renderFavs(); return; }
    else if (a?.dataset.fact === 'new') {
      if (favLists.length >= 12) { toast(t('fav.maxLists'), 'neg'); return; }
      const name = (prompt(t('fav.listName')) || '').trim().slice(0, 24);
      if (!name) return;
      const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
      favLists.push({ id, name });
      store.set('favLists', favLists);
      favView.list = id; saveFavView(); renderFavs();
    }
  };
  box.querySelector('#fav-sort').onchange = (e) => { favView.sort = e.target.value; saveFavView(); renderFavs(); };
}
/** Mode « Organiser » : liste de chaque favori, rangement dans une liste, ordre, retrait ; renommer ou supprimer la liste affichée. */
function renderFavOrganize(grid) {
  const list = favView.list === 'all' ? favs : favs.filter((f) => f.l === favView.list);
  const cur = favLists.find((x) => x.id === favView.list);
  grid.innerHTML = `<div class="fav-org card">
    ${cur ? `<div class="fav-row"><strong>${esc(cur.name)}</strong><button type="button" class="btn btn-sm" data-org="rename">${t('pt.acctRename')}</button>
      <button type="button" class="btn btn-sm" data-org="dellist">${t('fav.delList')}</button></div>` : ''}
    ${list.length ? `<ul>${list.map((f) => `<li data-key="${esc(favKey(f))}">${logoImg(f, 20, 'mv-logo')}<span class="mv-l"><strong>${esc(f.label)}</strong><small>${esc(f.name || '')}</small></span>
      <select class="lang-select" data-org="move" aria-label="${esc(t('fav.moveTo'))}"><option value="">${t('fav.noList')}</option>${favLists.map((x) => `<option value="${esc(x.id)}"${f.l === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <button type="button" class="alert-del" data-org="up" aria-label="${esc(t('fav.up'))}">↑</button><button type="button" class="alert-del" data-org="down" aria-label="${esc(t('fav.down'))}">↓</button>
      <button type="button" class="alert-del" data-org="rm" aria-label="${esc(t('fav.remove'))}">✕</button></li>`).join('')}</ul>` : `<p class="mc-note">${t('fav.emptyList')}</p>`}</div>`;
  const save = () => { store.set('favs', favs); renderFavs(); };
  grid.onclick = (e) => {
    const b = e.target.closest('button[data-org]'); if (!b) return;
    if (b.dataset.org === 'rename') { const n = (prompt(t('fav.listName'), cur.name) || '').trim().slice(0, 24); if (n) { cur.name = n; store.set('favLists', favLists); renderFavs(); } return; }
    if (b.dataset.org === 'dellist') {
      if (!confirm(t('fav.delListConfirm'))) return;
      favLists = favLists.filter((x) => x !== cur); store.set('favLists', favLists);
      favs = favs.map((f) => (f.l === cur.id ? { ...f, l: undefined } : f)); favView.list = 'all'; saveFavView(); save(); return;
    }
    const key = b.closest('li')?.dataset.key; const i = favs.findIndex((f) => favKey(f) === key); if (i < 0) return;
    if (b.dataset.org === 'rm') favs.splice(i, 1);
    else {
      // Déplacement dans l'ordre d'ajout, parmi les favoris de la liste affichée.
      const keys = list.map(favKey); const j = keys.indexOf(key) + (b.dataset.org === 'up' ? -1 : 1);
      if (j < 0 || j >= keys.length) return;
      const k = favs.findIndex((f) => favKey(f) === keys[j]); [favs[i], favs[k]] = [favs[k], favs[i]];
    }
    save();
  };
  grid.onchange = (e) => {
    const sel = e.target.closest('select[data-org="move"]'); if (!sel) return;
    const key = sel.closest('li').dataset.key; const f = favs.find((x) => favKey(x) === key);
    if (f) { f.l = sel.value || undefined; save(); }
  };
  grid.onkeydown = null;
}
function renderFavs() {
  renderFavAlerts();
  renderFavTools();
  const grid = $('#grid-favoris');
  if (!favs.length) {
    grid.innerHTML = `<div class="empty fav-empty">${t('fav.empty')}</div>`;
    grid.onclick = null;
    return;
  }
  if (favView.organize) return renderFavOrganize(grid);
  const shown = visibleFavs();
  if (!shown.length) { grid.innerHTML = `<div class="empty fav-empty">${t('fav.emptyList')}</div>`; grid.onclick = null; return; }
  if (favView.mode === 'table') return renderFavTable(grid, shown);
  if (favView.mode === 'corr') {
    grid.onclick = null;
    return analysis.corrRender(grid, shown.map((f) => ({ label: f.label, asset: favAsset(f) })), () => state.tab === 'favoris' && favView.mode === 'corr' && !favView.organize);
  }
  const field = PERIOD_FIELD[prefs.period];
  const actions = new Map();
  grid.innerHTML = shown.map((f) => {
    const key = favKey(f);
    if (f.t === 'i') {
      const ix = state.indices?.indices?.find((x) => x.id === f.id);
      if (ix) { actions.set(key, () => openIndexChart(ix)); return indexCardHTML(ix, key); }
      return assetCardHTML({ key, kicker: t('fav.index'), f: { ...f, name: f.name }, title: f.label, price: ND, pct: null, maxAbs: 2.5, foot: state.loading ? t('loading') : t('noData') });
    }
    if (f.t === 'm') {
      const m = macroById(f.id);
      if (m) { actions.set(key, () => openMacroChart(m)); return macroCardHTML(m, key); }
      return assetCardHTML({ key, kicker: t('macro.kind'), f, title: f.label, price: ND, pct: null, maxAbs: 2, foot: state.loading ? t('loading') : t('noData') });
    }
    if (f.t === 'c' && findCoin(f) < 0 && state.extra.c[f.id]) {
      const c = state.extra.c[f.id];
      const item = { ...c, label: c.symbol, changePct: isNum(c[field]) ? c[field] : null };
      actions.set(key, () => openChart(item, c.rank, null, null));
      return assetCardHTML({ key, kicker: `${t('fav.crypto')}${c.rank ? ` · ${t('rank', { n: c.rank })}` : ''}`, f: c, title: c.symbol, price: fmtPrice(c.price),
        pct: item.changePct, maxAbs: PERIOD_MAX[prefs.period], foot: `${t('change24', { p: periodLabel() })} · ${fmtCap(c.marketCap)}` });
    }
    if (f.t === 'c') {
      const i = findCoin(f);
      const c = i >= 0 ? state.crypto.coins[i] : null;
      if (!c) return assetCardHTML({ key, kicker: t('fav.crypto'), f, title: f.label, price: ND, pct: null, maxAbs: 8, foot: state.loading ? t('loading') : t('fav.missing') });
      const item = { ...c, label: c.symbol, changePct: isNum(c[field]) ? c[field] : null };
      const top = cryptoItems(state.crypto);
      const inTop = i < top.length;
      const total = top.reduce((s, x) => s + (isNum(x.marketCap) ? x.marketCap : 0), 0);
      actions.set(key, () => openChart(item, i + 1, inTop ? total : null, top.length));
      return assetCardHTML({ key, kicker: `${t('fav.crypto')} · ${t('rank', { n: i + 1 })}`, f: c, title: c.symbol, price: fmtPrice(c.price),
        pct: item.changePct, maxAbs: PERIOD_MAX[prefs.period], foot: `${t('change24', { p: periodLabel() })} · ${fmtCap(c.marketCap)}` });
    }
    const list = state.stocks?.companies || [];
    const i = list.findIndex((c) => c.id === f.id);
    if (i < 0 && state.extra.s[f.id]) {
      const c = state.extra.s[f.id];
      const st = statusOf(c);
      actions.set(key, () => openStockChart(c, null, null, null));
      return assetCardHTML({ key, kicker: c.exchangeName || t('fav.stock'), f: c, title: c.label, chip: st,
        price: fmtStockPrice(c.price, c.currency), pct: c.changePct, maxAbs: 4, foot: st.foot, clock: marketClock(c) });
    }
    const c = i >= 0 ? list[i] : null;
    if (!c) return assetCardHTML({ key, kicker: t('fav.stock'), f, title: f.label, price: ND, pct: null, maxAbs: 4, foot: state.loading ? t('loading') : t('fav.missingStock') });
    const top = stockItems(state.stocks);
    const total = top.reduce((s, x) => s + (isNum(x.marketCap) ? x.marketCap : 0), 0);
    actions.set(key, () => openStockChart(c, i + 1, i < top.length ? total : null, top.length));
    const st = statusOf(c);
    return assetCardHTML({ key, kicker: `${c.country ? country(c.country) : t('fav.stock')} · ${t('rank', { n: i + 1 })}`, f: c, title: c.label, chip: st,
      price: fmtStockPrice(c.price, c.currency), pct: c.changePct, maxAbs: 4, foot: st.foot, clock: marketClock(c) });
  }).join('');
  grid.onclick = (e) => {
    const card = e.target.closest('.idx');
    actions.get(card?.dataset.id)?.();
  };
  grid.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.idx');
    if (!card) return;
    e.preventDefault();
    card.click();
  };
}

function renderIndices(region) {
  if (MACRO_GROUPS.includes(region)) return renderMacro(region);
  if (region === 'carte') return renderWorldMap($('#grid-carte'));
  if (region === 'taux') return analysis.renderRates($('#grid-taux'));
  const grid = $(`#grid-${region}`);
  const list = state.indices?.indices?.filter((i) => i.region === region);
  if (!list?.length) {
    grid.innerHTML = state.loading ? Array.from({ length: 4 }, () => '<div class="idx skeleton"></div>').join('')
      : `<div class="empty" style="grid-column:1/-1">${t('noData')}</div>`;
    return;
  }
  if (prefs.idxView === 'perf') {
    return renderPerfTable(grid, list.map((ix) => ({ key: `i:${ix.id}`, label: indexName(ix), sub: country(ix.country), logo: ix, chg: ix.outdated ? null : ix.changePct,
      asset: ix.symbol ? { kind: 'i', assetId: ix.id, label: ix.name, symbol: ix.symbol } : null, open: () => openIndexChart(ix) })),
      () => state.tab === 'indices' && prefs.region === region && prefs.idxView === 'perf');
  }
  grid.innerHTML = list.map((ix) => indexCardHTML(ix)).join('');
  grid.onclick = (e) => {
    const card = e.target.closest('.idx');
    const ix = card && list.find((i) => i.id === card.dataset.id);
    if (ix) openIndexChart(ix);
  };
  grid.onkeydown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.idx');
    if (!card) return;
    e.preventDefault();
    card.click();
  };
}

/* ---------- En-tête, bannière ---------- */
function renderChrome() {
  const key = state.tab === 'actions' ? 'stocks' : ['crypto', 'favoris', 'compte'].includes(state.tab) ? 'crypto' : 'indices';
  const data = state[key];
  const when = data?.fetchedAt && (key === 'indices' || state.tab === 'favoris') ? ` · ${t('updatedShort')} ${fmtTime(data.fetchedAt)}` : '';
  const n = state.tab === 'crypto' ? cryptoItems(state.crypto).length || prefs.nCrypto : stockItems(state.stocks).length || prefs.nStocks;
  const titleKey = state.tab === 'indices' ? (MACRO_GROUPS.includes(prefs.region) ? `macro.g.${prefs.region}` : `title.${prefs.region}`) : `title.${state.tab}`;
  $('#subtitle').textContent = `${t(titleKey, { n, p: periodLabel() })}${when}`;

  const banner = $('#banner');
  let msg = '';
  if (!navigator.onLine) msg = data ? t('off.now', { d: fmtDay(data.fetchedAt), t: fmtTime(data.fetchedAt) }) : t('offlineNone');
  else if (state.offline[key] && data) msg = t('offlineData', { d: fmtDay(data.fetchedAt), t: fmtTime(data.fetchedAt) });
  else if (state.offline[key]) msg = t('offlineNone');
  else if (data?.stale) msg = t('staleBanner', { t: fmtTime(data.fetchedAt) });
  banner.textContent = msg;
  banner.hidden = !msg;

  const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  const crypto = state.crypto?.source === 'CoinPaprika'
    ? `${a('https://coinpaprika.com/', 'CoinPaprika')} ${t('fallback')}` : `Powered by ${a('https://www.coingecko.com/', 'CoinGecko')}`;
  const idxSources = [...new Set((state.indices?.indices || []).map((i) => i.source).filter(Boolean))];
  const colon = getLang() === 'fr' ? ' : ' : getLang() === 'zh' ? '：' : ': ';
  const src = [
    `${t('src.crypto')}${colon}${crypto}`,
    `${t('src.indices')}${colon}${esc(idxSources.length ? idxSources.join(', ') : 'Yahoo Finance')} ${t('delayed')}`,
    t('src.companies', { a: a('https://companiesmarketcap.com/', 'companiesmarketcap.com') }),
    `${t('src.charts')}${colon}${a('https://www.tradingview.com/', 'TradingView')}`,
  ];
  $('#sources').innerHTML = `${t('sources')} — ${src.join(' · ')}.`;
}

function render() {
  comfort.renderTicker();
  for (const t of TABS) {
    $(`#view-${t}`).hidden = t !== state.tab;
    document.querySelector(`.tabbar [data-tab="${t}"]`).setAttribute('aria-current', t === state.tab ? 'page' : 'false');
  }
  renderChrome();
  if (state.tab === 'crypto') renderCrypto();
  else if (state.tab === 'accueil') renderHome();
  else if (state.tab === 'actions') renderStocks();
  else if (state.tab === 'favoris') renderFavs();
  else if (state.tab === 'bot') bot.render($('#bot'));
  else if (state.tab === 'compte') {
    $('#compte-mode').innerHTML = segHTML('compteView', [['demo', t('pf.demo')], ['real', t('pf.real')], ['agents', t('ai.tab')]], t('pf.mode'));
    if (prefs.compteView === 'real') portfolio.render($('#paper'));
    else if (prefs.compteView === 'agents') agents.render($('#paper'));
    else paper.render($('#paper'));
  }
  else {
    for (const r of INDEX_TABS) $(`#grid-${r}`).hidden = r !== prefs.region;
    $('#indices-tools').innerHTML = segHTML('region', INDEX_TABS.map((r) => [r, t(`tab.${r}`)]), t('tools.region'))
      + (REGIONS.includes(prefs.region) && prefs.region !== 'carte' ? segHTML('idxView', [['cards', t('fav.cards')], ['perf', t('view.perf')]], t('tools.view')) : '');
    renderMarketClock();
    renderAgenda();
    renderIndices(prefs.region);
  }
}

/* ---------- Langue : textes statiques de la page ---------- */
function applyStatic() {
  const l = getLang();
  document.documentElement.lang = HTML_LANG[l];
  document.title = t('appName');
  const vars = { p: periodLabel(), n: prefs.nCrypto };
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n, vars);
  for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const el of document.querySelectorAll('[data-i18n-alt]')) el.alt = t(el.dataset.i18nAlt);
  for (const el of document.querySelectorAll('[data-i18n-ph]')) el.placeholder = t(el.dataset.i18nPh);
  for (const el of document.querySelectorAll('[data-legal]')) el.href = `${legalPrefix(l)}/${el.dataset.legal}.html`;
  const sel = $('#lang');
  if (sel && !sel.options.length) sel.innerHTML = LANGS.map((x) => `<option value="${x}">${LANG_LABELS[x]}</option>`).join('');
  if (sel) sel.value = l;
  themeLabel();
}
$('#lang')?.addEventListener('change', (e) => {
  setLang(e.target.value);
  initFormats();
  applyStatic();
  render();
  if (!$('#chart').hidden) $('#chart-close').click(); // l'écran graphique se rouvrira dans la nouvelle langue
});

/* ---------- Données ---------- */
async function getJSON(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const fromCache = res.headers.get('X-SW-Cache') === '1';
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { body: await res.json(), fromCache };
}

async function refresh() {
  if (state.loading) return;
  state.loading = true;
  $('#refresh').classList.add('spinning');
  if (!state.crypto || !state.indices || !state.stocks) render();
  const [c, i, st, fx, mc] = await Promise.allSettled([
    getJSON('/api/crypto'), getJSON('/api/indices'), getJSON(`/api/stocks?n=${stocksToLoad()}`), getJSON('/api/fx'), getJSON('/api/macro'),
  ]);
  for (const [key, r] of [['crypto', c], ['indices', i], ['stocks', st], ['fx', fx], ['macro', mc]]) {
    if (r.status === 'fulfilled' && !r.value.body.error) {
      state[key] = r.value.body;
      state.offline[key] = r.value.fromCache;
      if (!r.value.fromCache) store.set(key, r.value.body);
    } else {
      state.offline[key] = true;
    }
  }
  await refreshExtra();
  state.loading = false;
  state.lastFetch = Date.now();
  $('#refresh').classList.remove('spinning');
  paper.onData();
  tradeChart.onData();
  render();
  runGo();
}

/** Recharge seulement les entreprises (changement du top 25 / 50 / 100). */
async function loadStocks() {
  const n = stocksToLoad();
  try {
    const r = await getJSON(`/api/stocks?n=${n}`);
    if (r.body.error || stocksToLoad() !== n) return;
    state.stocks = r.body;
    state.offline.stocks = r.fromCache;
    if (!r.fromCache) store.set('stocks', r.body);
  } catch {
    state.offline.stocks = true;
  }
  paper.onData();
  render();
}
async function loadFx() {
  try {
    const r = await getJSON('/api/fx');
    if (r.body.error) return;
    state.fx = r.body;
    if (!r.fromCache) store.set('fx', r.body);
  } catch { /* on reste en dollars */ }
  render();
}

/* ---------- Réglages des heatmaps : période, top N, devise ---------- */
function segHTML(pref, options, label, prefix = '') {
  return `<div class="seg" role="group" aria-label="${esc(label)}">${prefix}${options.map(([v, text]) =>
    `<button type="button" data-pref="${pref}" data-v="${v}" aria-pressed="${String(prefs[pref] === v)}">${esc(text)}</button>`).join('')}</div>`;
}
function renderTools(kind) {
  const el = $(`#${kind}-tools`);
  if (!el) return;
  const parts = [];
  if (kind === 'crypto') parts.push(segHTML('period', [['1h', t('p.1h')], ['24h', t('p.24h')], ['7d', t('p.7d')]], t('tools.period')));
  parts.push(segHTML(kind === 'crypto' ? 'nCrypto' : 'nStocks', [[25, '25'], [50, '50'], [100, '100']], t('tools.top'),
    `<span class="seg-label" aria-hidden="true">${t('tools.top')}</span>`));
  parts.push(segHTML('cur', [['USD', '$'], ['EUR', '€']], t('tools.cur')));
  if (kind === 'stocks') parts.push(segHTML('stocksView', [['companies', t('view.companies')], ['sectors', t('view.sectors')], ['screener', t('view.screener')]], t('tools.view')));
  if (kind === 'crypto') parts.push(segHTML('cryptoView', [['coins', t('view.coins')], ['cats', t('view.cats')]], t('tools.view')));
  parts.push(`<button type="button" class="btn btn-sm tv-btn" data-tv="${kind}">${t('tv.btn')}</button>`);
  el.innerHTML = parts.join('');
  const note = $(`#${kind}-fx`);
  const fx = state.fx;
  note.hidden = prefs.cur !== 'EUR';
  note.textContent = eurRate()
    ? t('fx.note', { r: nf(4).format(fx.eurusd), src: fx.source || ND, t: fx.source === 'BCE' ? fmtDay(fx.time) : fmtTime(fx.time) })
    : t('fx.na');
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-pref]');
  if (!b) return;
  const k = b.dataset.pref;
  const v = k.startsWith('n') ? Number(b.dataset.v) : b.dataset.v;
  if (!PREF_VALUES[k]?.includes(v) || prefs[k] === v) return;
  prefs[k] = v;
  store.set('prefs', prefs);
  applyStatic();
  render();
  if (k === 'nStocks' && (state.stocks?.companies?.length ?? 0) < v) loadStocks();
  if (k === 'cur' && v === 'EUR' && !state.fx) loadFx();
});

/* ---------- Papertrading (compte de démonstration, argent fictif) ---------- */
/* Devises en sous-unités chez Yahoo : pence, agorot, cents sud-africains. */
const MINOR_CCY = { GBp: ['GBP', 100], GBX: ['GBP', 100], ILA: ['ILS', 100], ZAc: ['ZAR', 100], ZAC: ['ZAR', 100], USX: ['USD', 100] };
/** Dollars US pour 1 unité de la devise (taux de /api/fx) ; null si inconnu. */
function usdPer(ccy) {
  if (!ccy) return null;
  if (ccy === 'USD') return 1;
  const [base, div] = MINOR_CCY[ccy] || [ccy, 1];
  const r = state.fx?.rates?.[base] ?? (base === 'EUR' ? state.fx?.eurusd : null);
  return isNum(r) && r > 0 ? r / div : null;
}
/**
 * Cours utilisable pour le papertrading. ok = cours frais (et taux de change connu).
 * Marché fermé (actions, indices) : ok quand même, au dernier cours connu, avec closed = true.
 */
function quoteOf(x) {
  if (x.kind === 'c') {
    const c = coinById(x.assetId, x.label);
    if (!c || !isNum(c.price)) return { price: null, ok: false, reason: 'na' };
    const fresh = c.extra ? !state.offline.extra : !state.offline.crypto && !state.crypto.stale;
    return { price: c.price, chg: c.changePct, ok: fresh, reason: fresh ? null : 'stale', ccy: 'USD', fx: 1 };
  }
  const item = x.kind === 's' ? stockById(x.assetId)
    : x.kind === 'i' ? (state.indices?.indices || []).find((y) => y.id === x.assetId)
      : x.kind === 'm' ? macroById(x.assetId) : null;
  if (!item || !isNum(item.price)) return { price: null, ok: false, reason: 'na' };
  const key = item.extra ? 'extra' : x.kind === 's' ? 'stocks' : x.kind === 'm' ? 'macro' : 'indices';
  const ccy = item.currency || null;
  const fx = usdPer(ccy);
  const fresh = !state.offline[key] && !(state[key] && state[key].stale) && !item.outdated;
  const closed = item.state !== 'open';
  const base = { price: item.price, chg: item.changePct, ccy, fx, closed, lastTime: item.lastTime, clock: marketClock(item) };
  if (!fresh) return { ...base, ok: false, reason: 'stale' };
  if (!fx) return { ...base, ok: false, reason: 'fx' };
  return { ...base, ok: true, reason: null };
}
function toast(msg, kind = '') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.append(el);
  while (box.children.length > 2) box.firstElementChild.remove(); // 2 messages au plus à l'écran
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 3200);
}
const qtyNF = () => new Intl.NumberFormat(loc(), { maximumSignificantDigits: 6 });
/** Prix dans la devise de l'actif ; indice : en points. */
function priceIn(v, kind, ccy) {
  if (!isNum(v)) return ND;
  if (kind === 'i') return `${NF2.format(v)}\u00a0${t('pt.pts')}`;
  if (ccy === 'USX') return `${NF2.format(v)}\u00a0¢`;
  return fmtNative(v, ccy || 'USD');
}
/** Tous les actifs chargés (cryptos, entreprises, actifs trouvés par la recherche, matières premières et devises, indices). */
function allAssets() {
  return [
    ...(state.crypto?.coins || []).map((c) => ({ kind: 'c', assetId: c.id, label: c.symbol, name: c.name, logo: c.logo, logoSmall: c.logoSmall, price: c.price, chg: c.changePct })),
    ...(state.stocks?.companies || []).filter((c) => isNum(c.price))
      .map((c) => ({ kind: 's', assetId: c.id, label: c.label, name: c.name, logo: c.logo, logoSmall: c.logoSmall, price: c.price, chg: c.changePct, ccy: c.currency })),
    ...Object.values(state.extra.c).filter((c) => isNum(c.price))
      .map((c) => ({ kind: 'c', assetId: c.id, label: c.symbol, name: c.name, logo: c.logo, logoSmall: c.logoSmall, price: c.price, chg: c.changePct })),
    ...Object.values(state.extra.s).filter((c) => isNum(c.price))
      .map((c) => ({ kind: 's', assetId: c.id, label: c.label, name: c.name, logo: c.logo, logoSmall: c.logoSmall, price: c.price, chg: c.changePct, ccy: c.currency })),
    ...(state.macro?.items || []).filter((m) => isNum(m.price))
      .map((m) => ({ kind: 'm', assetId: m.id, label: macroName(m), name: t(`macro.g.${m.group}`), symbol: m.symbol, logo: m.logo, logoSmall: m.logoSmall, price: m.price, chg: m.changePct, ccy: m.currency })),
    ...(state.indices?.indices || []).filter((i) => isNum(i.price) && !i.outdated)
      .map((i) => ({ kind: 'i', assetId: i.id, label: i.name, name: country(i.country), symbol: i.symbol, logo: i.logo, logoSmall: i.logoSmall, price: i.price, chg: i.changePct, ccy: i.currency })),
  ];
}
const paper = createPaper({
  t, store, esc, isNum, ND,
  quote: quoteOf,
  money: (v) => fmtNative(v, 'USD'),
  price: priceIn,
  cd: (c) => cdHTML(c, 'pt-cd'),
  unit: (kind, ccy) => (kind === 'i' ? t('pt.pts') : !ccy || ccy === 'USD' ? '$' : ccy === 'USX' ? '¢' : ccy),
  fxText: (fx, ccy) => (isNum(fx) ? (fx >= 0.1 ? `1 ${ccy} = ${fmtNative(fx, 'USD')}` : `1 $ = ${NF2.format(1 / fx)} ${ccy}`) : ND),
  pct: (v) => fmtPct(v),
  qty: (v) => (isNum(v) ? (Math.abs(v) >= 1000 ? NF2 : qtyNF()).format(v) : ND),
  NF1: () => NF1, NF2: () => NF2, pctSign,
  day: (ms) => fmtDay(ms), time: (ms) => fmtTime(ms),
  parse: parseAmount,
  fmtInput,
  api: (action, body) => alertsApi(action, body),
  linkDevice: (code, on) => linkDevice(code, on),
  share: (x, closed) => shareTrade(x, closed),
  lang: () => getLang(),
  locale: () => loc(),
  gloss: (k) => glossBtn(k),
  duration: (ms) => fmtDuration(ms),
  num: (v, prec) => (isNum(v) ? new Intl.NumberFormat(loc(), { minimumFractionDigits: prec, maximumFractionDigits: prec }).format(v) : ND),
  fetchCandles: (a, tf) => fetchCandles(a, tf),
  legalPrefix: () => legalPrefix(),
  logo: (a, size) => logoImg(a, size, 'pt-logo'),
  toast,
  changed: () => { tradeChart.refresh(); if (state.tab === 'compte') render(); if ((state.stocks?.companies?.length ?? 0) < stocksToLoad()) loadStocks(); },
  assets: allAssets,
  plan: (a) => analysis.getPlan(`${a.kind}:${a.assetId}`),
  openCalc: (o) => analysis.openCalc(o),
});

/** Nombre pour un champ de saisie (sans séparateur de milliers, décimale de la langue). */
function fmtInput(v) {
  if (!isNum(v)) return '';
  const a = Math.abs(v);
  const dec = a >= 1000 ? 2 : a >= 1 ? 4 : 8;
  return new Intl.NumberFormat(loc(), { useGrouping: false, maximumFractionDigits: dec }).format(v);
}
const tradeChart = createTradeChart({
  t, esc, isNum, paper, liqPrice, toast,
  quote: quoteOf,
  money: (v) => fmtNative(v, 'USD'),
  price: priceIn,
  signed: (v) => (isNum(v) ? `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${fmtNative(Math.abs(v), 'USD')}` : ND),
  num: (v, prec) => (isNum(v) ? new Intl.NumberFormat(loc(), { minimumFractionDigits: prec, maximumFractionDigits: prec }).format(v) : ''),
  qty: (v) => (isNum(v) ? qtyNF().format(v) : ND),
  locale: () => loc(),
  getTf: () => prefs.tcTf,
  getInd: () => { const v = store.get('tcInd'); return Array.isArray(v) ? v.filter((x) => INDICATORS.includes(x)) : ['ma20']; },
  setInd: (v) => store.set('tcInd', v),
  getDraw: (k) => { const all = store.get('tcDraw') || {}; return Array.isArray(all[k]) ? all[k] : []; },
  setDraw: (k, v) => {
    const all = store.get('tcDraw') || {};
    if (v.length) all[k] = v; else delete all[k];
    const keys = Object.keys(all); if (keys.length > 50) delete all[keys[0]]; // 50 actifs au plus
    store.set('tcDraw', all);
  },
  setTf: (tf) => { prefs.tcTf = tf; store.set('prefs', prefs); },
  openTicket: (asset, pre) => paper.openTicket(asset, pre),
  openAlert: (price) => {
    if (!chartArgs?.alert) return;
    openAlert(chartArgs.alert);
    $('#alert-target').value = fmtInput(price);
    updateAlertDir();
  },
  fetchCandles,
  fetchEvents: async (sym) => { const r = await fetch(`/api/events?sym=${encodeURIComponent(sym)}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); },
  compareList: () => allAssets().map((a) => ({ ...a, key: `${a.kind}:${a.assetId}` })),
});

/** Bougies réelles d'un actif (/api/candles). */
async function fetchCandles(a, tf) {
  const q = quoteOf(a);
  const params = new URLSearchParams({ kind: a.kind, symbol: a.kind === 'c' ? a.label : ['i', 'm'].includes(a.kind) ? a.symbol : a.assetId, tf });
  if (a.kind === 'c' && /^[a-z0-9-]+$/.test(a.assetId)) params.set('id', a.assetId);
  if (isNum(q.price)) params.set('ref', String(q.price));
  const r = await fetch(`/api/candles?${params}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* ---------- Thème (Auto / Sombre / Clair) : assets/theme.js ---------- */
const isLight = () => document.documentElement.dataset.theme === 'light';
function themeLabel() {
  const pref = window.marchesTheme?.pref() || 'auto';
  $('#theme-btn').setAttribute('aria-label', t('theme.btn', { m: t(`theme.${pref}`) }));
  $('#theme-btn').title = t('theme.btn', { m: t(`theme.${pref}`) });
}
$('#theme-btn').addEventListener('click', () => {
  const T = window.marchesTheme;
  if (!T) return;
  const next = T.modes[(T.modes.indexOf(T.pref()) + 1) % T.modes.length];
  T.set(next);
  toast(t('theme.btn', { m: t(`theme.${next}`) }));
});
function reloadTVTheme() {
  const ifr = $('#chart-frame iframe');
  if (!ifr) return;
  const u = new URL(ifr.src);
  u.searchParams.set('theme', isLight() ? 'light' : 'dark');
  u.searchParams.set('toolbarbg', isLight() ? 'f4f6f9' : '0b0f14');
  ifr.src = u.href;
}
let tvThemeShown = isLight();
window.addEventListener('marches-theme', () => {
  themeLabel();
  tradeChart.theme?.();
  // Graphique TradingView ouvert : rechargé avec le bon thème.
  if (tvThemeShown !== isLight()) { tvThemeShown = isLight(); reloadTVTheme(); }
});


/* ---------- Plus fortes hausses et baisses (sous les heatmaps et dans « En bref ») ---------- */
function moversLists(items, n = 5) {
  const ok = items.filter((c) => isNum(c.changePct));
  const up = ok.filter((c) => c.changePct > 0).sort((a, b) => b.changePct - a.changePct).slice(0, n);
  const down = ok.filter((c) => c.changePct < 0).sort((a, b) => a.changePct - b.changePct).slice(0, n);
  return { up, down };
}
function moverRow(c, priceText) {
  return `<li><button type="button" class="mv-row" data-mv="${esc(c.id)}">${logoImg(c, 20, 'mv-logo')}<span class="mv-l"><strong>${esc(c.label)}</strong><small>${esc(c.name || '')}</small></span>
    <span class="mv-p">${priceText(c)}<b class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</b></span></button></li>`;
}
function renderMovers(box, items, priceText, open, periodText) {
  if (!box) return;
  const { up, down } = moversLists(items);
  if (!up.length && !down.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<h2>${t('movers.title')} <small>${esc(periodText)}</small></h2>
    <div class="mv-cols"><div><h3 class="pos">▲ ${t('movers.up')}</h3><ol>${up.map((c) => moverRow(c, priceText)).join('') || `<li class="mv-none">${ND}</li>`}</ol></div>
    <div><h3 class="neg">▼ ${t('movers.down')}</h3><ol>${down.map((c) => moverRow(c, priceText)).join('') || `<li class="mv-none">${ND}</li>`}</ol></div></div>`;
  box.onclick = (e) => { const b = e.target.closest('[data-mv]'); const c = b && items.find((x) => x.id === b.dataset.mv); if (c) open(c); };
}

/* ---------- Fiche détaillée d'un actif (écran graphique) : calculée sur les bougies journalières réelles ---------- */
async function renderFacts(asset, token) {
  const box = $('#chart-facts');
  box.innerHTML = '';
  $('#chart-facts-box').hidden = !asset;
  if (!asset) return;
  box.innerHTML = `<h3>${t('facts.title')}</h3><p class="mc-note">${t('loading')}</p>`;
  let d = null;
  try { d = await fetchCandles(asset, '1d'); } catch { /* n/d */ }
  if (token !== chartToken) return;
  const c = (d?.candles || []).filter((x) => isNum(x[4]));
  if (c.length < 20) { box.innerHTML = `<h3>${t('facts.title')}</h3><p class="mc-note">${t('facts.na')}</p>`; return; }
  const last = c[c.length - 1], close = last[4], nowS = last[0];
  const DAY = 86400;
  const closeAt = (sec) => { let v = null; for (const x of c) { if (x[0] <= sec) v = x[4]; else break; } return v; };
  const perf = (sec) => { const v = closeAt(sec); return isNum(v) && c[0][0] <= sec ? (close / v - 1) * 100 : null; };
  const year = c.filter((x) => x[0] > nowS - 365 * DAY);
  const hi = Math.max(...year.map((x) => x[2])), lo = Math.min(...year.map((x) => x[3]));
  const jan1 = Date.UTC(new Date(nowS * 1000).getUTCFullYear(), 0, 1) / 1000;
  const bars = c.map((x) => ({ time: x[0], close: x[4], volume: x[5] ?? null }));
  const rsiV = rsi(bars).at(-1)?.value;
  const ma50 = bars.length >= 50 ? sma(bars, 50).at(-1).value : null, ma200 = bars.length >= 200 ? sma(bars, 200).at(-1).value : null;
  const vr = volumeRatio(bars);
  const p = (v) => priceIn(v, asset.kind, d.currency || (asset.kind === 'c' ? 'USD' : null));
  const pc = (v) => (isNum(v) ? `<span class="${signClass(v)}">${fmtPct(v)}</span>` : ND);
  const side = (ma) => (isNum(ma) ? `${close >= ma ? t('facts.above') : t('facts.below')} (${p(ma)})` : ND);
  const sector = asset.kind === 's' ? state.sectors?.sectors?.[asset.assetId] : null;
  const earn = asset.kind === 's' ? (agenda?.earnings || []).find((e) => e.symbol === asset.assetId) : null;
  const rows = [
    [t('facts.hi52'), `${p(hi)} <small>${pc((close / hi - 1) * 100)}</small>`],
    [t('facts.lo52'), `${p(lo)} <small>${pc((close / lo - 1) * 100)}</small>`],
    [t('facts.p1w'), pc(perf(nowS - 7 * DAY))], [t('facts.p1m'), pc(perf(nowS - 30 * DAY))], [t('facts.p3m'), pc(perf(nowS - 91 * DAY))],
    [t('facts.ytd'), pc(perf(jan1))], [t('facts.p1y'), pc(perf(nowS - 365 * DAY))],
    [t('facts.p5y'), pc(perf(nowS - 5 * 365 * DAY + 7 * DAY))],
    [`${t('facts.rsi')} ${glossBtn('rsi')}`, isNum(rsiV) ? NF1.format(rsiV) : ND],
    [`${t('facts.ma50')} ${glossBtn('ma')}`, side(ma50)], [t('facts.ma200'), side(ma200)],
    [`${t('facts.vol')} ${glossBtn('vol')}`, isNum(vr) ? `${NF1.format(vr)} ×` : ND],
  ];
  if (sector) rows.push([t('facts.sector'), esc(sectorName(sector))]);
  if (earn) rows.push([t('facts.earnings'), `${fmtDay(dayMs(earn.date), 'UTC')}${earn.time ? ` · ${t(`ag.${earn.time}`)}` : ''}`]);
  const div = asset.kind === 's' ? (divData?.items || []).find((x) => x.symbol === asset.assetId) : null;
  if (div) rows.push([t('facts.div'), `${fmtDay(dayMs(div.exDate), 'UTC')}${isNum(div.amount) ? ` · ${fmtNative(div.amount, 'USD')}` : ''}`]);
  box.innerHTML = `<h3>${t('facts.title')}</h3><dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    <p class="mc-note">${t('facts.note', { s: esc(d.source || ND), d: fmtDay(nowS * 1000) })}</p>`;
}

/* ---------- Onglet « En bref » ---------- */
const HOME_INDICES = ['spx', 'ixic', 'sx5e', 'cac', 'dax', 'ftse', 'n225', 'hsi'];
const HOME_OTHERS = [['c', 'bitcoin'], ['c', 'ethereum'], ['m', 'gold'], ['m', 'brent'], ['m', 'eurusd']];
function homeRow({ key, logo, label, sub, price, pct }) {
  return `<li><button type="button" class="mv-row" data-home="${esc(key)}">${logo || ''}<span class="mv-l"><strong>${esc(label)}</strong><small>${esc(sub || '')}</small></span>
    <span class="mv-p">${price}<b class="${signClass(pct)}">${fmtPct(pct)}</b></span></button></li>`;
}
function renderHome() {
  const box = $('#home');
  const open = new Map();
  const ix = state.indices?.indices || [];
  const idxRows = HOME_INDICES.map((id) => ix.find((x) => x.id === id)).filter(Boolean).map((x) => {
    open.set(`i:${x.id}`, () => openIndexChart(x));
    return homeRow({ key: `i:${x.id}`, logo: logoImg(x, 20, 'mv-logo'), label: indexName(x), sub: country(x.country), price: x.outdated ? ND : fmtLevel(x.price), pct: x.outdated ? null : x.changePct });
  });
  const otherRows = HOME_OTHERS.map(([k, id]) => {
    if (k === 'c') {
      const c = coinById(id); if (!c) return '';
      open.set(`c:${id}`, () => openCryptoRanked(c));
      return homeRow({ key: `c:${id}`, logo: logoImg(c, 20, 'mv-logo'), label: c.symbol, sub: `${c.name} · 24 h`, price: fmtPrice(c.price), pct: c.changePct });
    }
    const m = macroById(id); if (!m) return '';
    open.set(`m:${id}`, () => openMacroChart(m));
    return homeRow({ key: `m:${id}`, logo: logoImg(m, 20, 'mv-logo'), label: macroName(m), sub: t(`macro.g.${m.group}`), price: m.outdated ? ND : fmtMacro(m), pct: m.outdated ? null : m.changePct });
  }).filter(Boolean);
  // Places ouvertes maintenant (parmi les grandes places du décompte)
  const clocks = CLOCK_MARKETS.map((id) => ix.find((x) => x.id === id)).filter(Boolean).map((x) => marketClock(x)).filter(Boolean);
  const openNow = clocks.filter((c) => c.kind === 'close').length;
  // Plus fortes variations
  const cm = moversLists(cryptoItems(state.crypto), 3), sm = moversLists(stockItems(state.stocks), 3);
  const mvRows = (list, kind) => list.map((c) => {
    const key = `${kind}:${c.id}`;
    open.set(key, () => (kind === 'c' ? openCryptoRanked(c) : openStockRanked(c)));
    return homeRow({ key, logo: logoImg(c, 20, 'mv-logo'), label: c.label, sub: c.name, price: kind === 'c' ? fmtPrice(c.price) : fmtStockPrice(c.price, c.currency), pct: c.changePct });
  }).join('');
  // Favoris (6 premiers)
  const favRows = favs.slice(0, 6).map((f) => {
    const kind = f.t; const a = { kind, assetId: f.id, label: f.label };
    const q = quoteOf(a);
    const key = `f:${favKey(f)}`;
    open.set(key, () => openFav(f));
    return homeRow({ key, logo: logoImg(f, 20, 'mv-logo'), label: f.label, sub: f.name || '', price: isNum(q.price) ? priceIn(q.price, kind, q.ccy) : ND, pct: q.chg });
  }).join('');
  // Compte démo
  const pi = paper.info();
  // Agenda : prochaine décision de taux et résultats d'aujourd'hui / demain
  if (!agenda || Date.now() - agendaAt > 30 * 60_000) loadAgenda();
  const today = new Date().toLocaleDateString('en-CA');
  const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA');
  const bank = agenda?.central?.[0];
  const soon = (agenda?.earnings || []).filter((e) => e.date === today || e.date === tomorrow).slice(0, 4);
  box.innerHTML = `
    <section class="card home-card"><h2>${t('home.now')} <small>${fmtDay(Date.now())}</small></h2>
      <p class="home-open">${clocks.length ? t('home.openNow', { n: openNow, m: clocks.length }) : ''}</p>
      ${idxRows.length ? `<ol class="mv-list">${idxRows.join('')}</ol>` : `<p class="mc-note">${state.loading ? t('loading') : ND}</p>`}</section>
    <section class="card home-card"><h2>${t('home.others')}</h2>${otherRows.length ? `<ol class="mv-list">${otherRows.join('')}</ol>` : `<p class="mc-note">${state.loading ? t('loading') : ND}</p>`}
      ${analysis.homeRatesHTML()}${analysis.rates() ? `<button type="button" class="btn btn-sm" data-go-rates>${t('rt.see')}</button>` : ''}</section>
    ${sentimentHTML()}
    <section class="card home-card"><h2>${t('movers.title')}</h2>
      <h3>${t('home.cryptos')} <small>${esc(periodLabel())}</small></h3><ol class="mv-list">${mvRows([...cm.up, ...cm.down], 'c') || `<li class="mv-none">${ND}</li>`}</ol>
      <h3>${t('home.stocks')} <small>${t('movers.session')}</small></h3><ol class="mv-list">${mvRows([...sm.up, ...sm.down], 's') || `<li class="mv-none">${ND}</li>`}</ol></section>
    <section class="card home-card"><h2>${t('ag.title')}</h2>
      ${bank ? `<p class="home-line"><span class="ag-badge ${bank.bank}">${t(`ag.${bank.bank}`)}</span> ${t('ag.rate')} · <b>${fmtDay(dayMs(bank.date), 'UTC')}</b> <small>${inDays(bank.date)}</small></p>` : ''}
      ${soon.length ? `<p class="home-line">${t('home.earnSoon')} ${soon.map((e) => `<b>${esc(e.symbol)}</b> <small>${e.date === today ? t('ag.today') : t('ag.tomorrow')}</small>`).join(' · ')}</p>` : ''}
      ${!agenda ? `<p class="mc-note">${t('loading')}</p>` : agenda.error ? `<p class="mc-note">${t('ag.na')}</p>` : ''}
      <button type="button" class="btn btn-sm" data-go="indices">${t('home.seeAgenda')}</button></section>
    <section class="card home-card"><h2>${t('home.demo')}</h2>
      ${pi ? `<p class="home-demo"><b>${fmtNative(pi.equity, 'USD')}</b> <span class="${signClass(pi.pnlPct)}">${fmtPct(pi.pnlPct)}</span>
        <small>${esc(pi.name)} · ${t('home.demoPos', { p: pi.positions, o: pi.orders })}</small></p>` : `<p class="mc-note">${t('home.demoNone')}</p>`}
      <button type="button" class="btn btn-sm" data-go="compte">${t(pi ? 'home.openDemo' : 'pt.create')}</button>
      ${agents.homeHTML()}<button type="button" class="btn btn-sm" data-go-agents>${t('ai.see')}</button></section>
    <section class="card home-card"><h2>${t('tab.favoris')}</h2>${favRows ? `<ol class="mv-list">${favRows}</ol>` : `<p class="mc-note">${t('fav.empty')}</p>`}</section>
    <section class="card home-card"><h2>${t('home.tools')}</h2>
      <div class="home-tools"><button type="button" class="btn" data-tool="search">${t('search.title')}</button>
        <button type="button" class="btn" data-tool="conv">${t('conv.title')}</button>
        <button type="button" class="btn" data-tool="gloss">${t('gl.title')}</button>
        <button type="button" class="btn" data-tool="calc">${t('calc.title')}</button>
        <a class="btn" href="${legalPrefix()}/formation.html">${t('fm.title')}</a>
        <button type="button" class="btn" data-tool="tour">${t('tour.replay')}</button></div>
      <label class="home-switch"><input type="checkbox" data-ticker ${comfort.tickerOn() ? 'checked' : ''}> ${t('tk.toggle')}</label>
      <div class="home-summary"><h3>${t('ts.title')}</h3><div class="seg" role="group" aria-label="${esc(t('ts.title'))}">${TEXT_SCALES.map((z) =>
        `<button type="button" data-ts="${z}" aria-pressed="${textScale() === z}">${Math.round(z * 100)} %</button>`).join('')}</div></div>
      ${summaryHTML()}
      ${movesHTML()}
      ${notifHTML()}</section>
    <p class="consent-small">${t('home.note')}</p>`;
  box.onclick = (e) => {
    const r = e.target.closest('[data-home]'); if (r) { open.get(r.dataset.home)?.(); return; }
    const g = e.target.closest('[data-go]'); if (g) { setTab(g.dataset.go); return; }
    const tl = e.target.closest('[data-tool]');
    if (tl?.dataset.tool === 'search') openSearch();
    else if (tl?.dataset.tool === 'conv') openConverter();
    else if (tl?.dataset.tool === 'gloss') openGloss();
    else if (tl?.dataset.tool === 'calc') analysis.openCalc();
    else if (tl?.dataset.tool === 'tour') comfort.startTour();
    if (e.target.closest('[data-go-rates]')) { prefs.region = 'taux'; store.set('prefs', prefs); setTab('indices'); return; }
    if (e.target.closest('[data-go-agents]')) { prefs.compteView = 'agents'; store.set('prefs', prefs); if (state.tab === 'compte') render(); else setTab('compte'); return; }
    const ts = e.target.closest('[data-ts]'); if (ts) setTextScale(Number(ts.dataset.ts));
  };
  bindSummary(box);
  bindMoves(box);
  bindNotif(box);
  box.querySelector('[data-ticker]')?.addEventListener('change', (e) => comfort.setTicker(e.target.checked));
  analysis.loadRates(() => { if (state.tab === 'accueil') renderHome(); });
  agents.load(() => { if (state.tab === 'accueil') renderHome(); });
}
/** Graphique d'une crypto ou d'une entreprise avec son rang et sa part du top affiché (comme depuis la heatmap). */
function openCryptoRanked(c) {
  const top = cryptoItems(state.crypto);
  const i = (state.crypto?.coins || []).findIndex((x) => x.id === c.id);
  const total = top.reduce((s, x) => s + (isNum(x.marketCap) ? x.marketCap : 0), 0);
  const item = { ...c, label: c.symbol || c.label, changePct: isNum(c[PERIOD_FIELD[prefs.period]]) ? c[PERIOD_FIELD[prefs.period]] : c.changePct };
  openChart(item, i >= 0 ? i + 1 : null, i >= 0 && i < top.length ? total : null, top.length);
}
function openStockRanked(c) {
  const top = stockItems(state.stocks);
  const i = (state.stocks?.companies || []).findIndex((x) => x.id === c.id);
  const total = top.reduce((s, x) => s + (isNum(x.marketCap) ? x.marketCap : 0), 0);
  openStockChart(c, i >= 0 ? i + 1 : null, i >= 0 && i < top.length ? total : null, top.length);
}
/** Ouvre le graphique d'un favori. */
function openFav(f) {
  if (f.t === 'i') { const x = state.indices?.indices?.find((y) => y.id === f.id); if (x) openIndexChart(x); return; }
  if (f.t === 'm') { const m = macroById(f.id); if (m) openMacroChart(m); return; }
  if (f.t === 'c') { const c = coinById(f.id, f.label); if (c) openCryptoRanked(c); return; }
  const c = stockById(f.id); if (c) openStockRanked(c);
}

/* ---------- Résumé quotidien par notification (favoris + compte démo lié) ---------- */
function summaryHTML() {
  const cur = alertsCache?.summary;
  return `<div class="home-summary"><h3>${t('sum.title')}</h3><p class="consent-small">${t('sum.intro')}</p>
    <div class="pt-join"><div class="alert-input"><input id="sum-time" type="time" value="${esc(cur?.time || '18:00')}" aria-label="${esc(t('sum.time'))}"></div>
      <button type="button" class="btn" data-sum="on">${t(cur ? 'sum.update' : 'sum.on')}</button>
      ${cur ? `<button type="button" class="btn" data-sum="off">${t('sum.off')}</button>` : ''}</div>
    <p class="consent-small">${cur ? t('sum.active', { t: esc(cur.time), n: cur.count }) : ''} ${t('sum.privacy', { link: `<a href="${legalPrefix()}/confidentialite.html#resume">${t('alert.privacy')}</a>` })}</p></div>`;
}
function bindSummary(root) {
  if (store.get(ALERT_TOKEN) && !alertsCache) loadAlerts().then(() => { if (state.tab === 'accueil') renderHome(); });
  root.querySelectorAll('[data-sum]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      if (b.dataset.sum === 'off') {
        await alertsApi('summary.set', { token: store.get(ALERT_TOKEN), time: null });
      } else {
        const sup = pushSupport();
        if (sup !== 'ok') { toast(t(sup === 'ios' ? 'alert.ios' : 'alert.unsupported'), 'neg'); b.disabled = false; return; }
        const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (perm !== 'granted') { toast(t('alert.denied'), 'neg'); b.disabled = false; return; }
        const token = await ensureDevice();
        let tz = 'UTC';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* UTC */ }
        await alertsApi('summary.set', { token, time: root.querySelector('#sum-time').value || '18:00', tz,
          assets: favs.slice(0, 30).map((f) => ({ kind: f.t, assetId: f.id, label: f.label })) });
        toast(t('sum.saved'));
      }
      await loadAlerts(true);
    } catch { toast(t('alert.error'), 'neg'); }
    if (state.tab === 'accueil') renderHome();
  }));
}

/* ---------- Convertisseur de devises et de cryptos (taux /api/fx, cours /api/crypto) ---------- */
let conv = { amount: '100', from: 'EUR', to: 'USD' };
function convUnits() {
  const out = [['USD', t('conv.usd'), 1]];
  for (const [c, r] of Object.entries(state.fx?.rates || {})) if (isNum(r) && r > 0) out.push([c, c, r]);
  for (const c of (state.crypto?.coins || []).slice(0, 50)) if (isNum(c.price) && c.price > 0) out.push([`crypto:${c.id}`, `${c.symbol} · ${c.name}`, c.price]);
  return out;
}
function openConverter() {
  const units = convUnits();
  const opts = (sel) => units.map(([k, l]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  let dlg = $('#conv');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = 'conv'; dlg.className = 'snap'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'conv-title');
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeConverter(); });
  }
  dlg.innerHTML = `<div class="snap-card alert-card"><h2 id="conv-title">${t('conv.title')}</h2>
    <div class="alert-input"><input id="conv-amount" type="text" inputmode="decimal" value="${esc(conv.amount)}" aria-label="${esc(t('conv.amount'))}"></div>
    <label for="conv-from">${t('conv.from')}</label><select id="conv-from" class="lang-select dca-select">${opts(conv.from)}</select>
    <button type="button" class="btn btn-sm" id="conv-swap">⇅ ${t('conv.swap')}</button>
    <label for="conv-to">${t('conv.to')}</label><select id="conv-to" class="lang-select dca-select">${opts(conv.to)}</select>
    <p class="conv-out" id="conv-out" aria-live="polite"></p><p class="consent-small" id="conv-src"></p>
    <div class="snap-actions"><button type="button" class="btn" id="conv-close">${t('snap.close')}</button></div></div>`;
  const upd = () => {
    conv = { amount: dlg.querySelector('#conv-amount').value, from: dlg.querySelector('#conv-from').value, to: dlg.querySelector('#conv-to').value };
    const u = new Map(convUnits().map(([k, l, r]) => [k, { l, r }]));
    const a = parseAmount(conv.amount), f = u.get(conv.from), to = u.get(conv.to);
    const name = (k, x) => (k.startsWith('crypto:') ? x.l.split(' · ')[0] : k);
    const out = dlg.querySelector('#conv-out');
    if (!isNum(a) || !f || !to) { out.textContent = ND; return; }
    const v = (a * f.r) / to.r;
    const nf = new Intl.NumberFormat(loc(), { maximumSignificantDigits: Math.abs(v) >= 1 ? 10 : 6, maximumFractionDigits: Math.abs(v) >= 1 ? 4 : 10 });
    out.innerHTML = `${esc(NF2.format(a))} ${esc(name(conv.from, f))} = <b>${esc(nf.format(v))} ${esc(name(conv.to, to))}</b>`;
    const fxT = state.fx?.time ? fmtTime(state.fx.time) : ND;
    dlg.querySelector('#conv-src').textContent = t('conv.note', { fx: state.fx?.source || ND, t: fxT, c: state.crypto?.source || ND });
  };
  dlg.querySelectorAll('input, select').forEach((x) => x.addEventListener('input', upd));
  dlg.querySelector('#conv-swap').addEventListener('click', () => {
    const a = dlg.querySelector('#conv-from'), b = dlg.querySelector('#conv-to'); [a.value, b.value] = [b.value, a.value]; upd();
  });
  dlg.querySelector('#conv-close').addEventListener('click', closeConverter);
  if (!state.fx) loadFx().then(upd);
  dlg.hidden = false;
  document.body.style.overflow = 'hidden';
  upd();
  dlg.querySelector('#conv-amount').focus();
}
function closeConverter() {
  const d = $('#conv');
  if (!d || d.hidden) return;
  d.hidden = true;
  if ($('#chart').hidden) document.body.style.overflow = '';
}


/* ---------- Carte du monde des indices (variation du jour de l'indice principal de chaque pays) ---------- */
// Code pays ISO 3166 numérique (Natural Earth) → indice affiché.
const MAP_INDEX = { 840: 'spx', 124: 'tsx', 76: 'ibov', 484: 'ipc', 32: 'merval', 250: 'cac', 276: 'dax', 826: 'ftse', 724: 'ibex', 380: 'ftsemib',
  528: 'aex', 756: 'smi', 56: 'bel20', 620: 'psi', 40: 'atx', 752: 'omx', 578: 'osebx', 616: 'wig20', 792: 'xu100', 156: 'sse', 344: 'hsi', 392: 'n225',
  410: 'kospi', 158: 'taiex', 356: 'nifty', 702: 'sti', 360: 'jkse', 458: 'klci', 764: 'set', 36: 'asx200', 554: 'nz50', 682: 'tasi', 376: 'ta125', 710: 'jse40', 818: 'egx30' };
let worldData = null, worldLoading = false;
function renderWorldMap(box) {
  if (!worldData) {
    box.innerHTML = `<p class="mc-note">${t('loading')}</p>`;
    if (!worldLoading) {
      worldLoading = true;
      fetch('/data/world.json').then((r) => (r.ok ? r.json() : null)).then((d) => { worldData = d || { error: true }; })
        .catch(() => { worldData = { error: true }; }).finally(() => { worldLoading = false; if (state.tab === 'indices' && prefs.region === 'carte') renderWorldMap(box); });
    }
    return;
  }
  if (worldData.error) { box.innerHTML = `<p class="mc-note">${t('noData')}</p>`; return; }
  const list = state.indices?.indices || [];
  const ix = (num) => { const id = MAP_INDEX[Number(num)]; return id ? list.find((x) => x.id === id) : null; };
  const fillOf = (x) => (x && !x.outdated && isNum(x.changePct) ? heat(x.changePct, 2.5) : null);
  const label = (x) => `${country(x.country)} · ${indexName(x)} : ${x.outdated ? ND : fmtPct(x.changePct)}`;
  const shapes = worldData.countries.map((c) => {
    const x = ix(c.id), f = fillOf(x);
    return x ? `<path d="${c.d}" class="wm-c on" style="fill:${f || 'var(--surface-2)'}" data-ix="${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(label(x))}"><title>${esc(label(x))}</title></path>`
      : `<path d="${c.d}" class="wm-c"/>`;
  }).join('');
  const dots = Object.entries(worldData.dots || {}).map(([id, [cx, cy]]) => {
    const x = ix(id); if (!x) return '';
    return `<circle cx="${cx}" cy="${cy}" r="6" class="wm-dot" style="fill:${fillOf(x) || 'var(--surface-2)'}" data-ix="${esc(x.id)}" tabindex="0" role="button" aria-label="${esc(label(x))}"><title>${esc(label(x))}</title></circle>`;
  }).join('');
  box.innerHTML = `<svg class="wm" viewBox="0 0 ${worldData.w} ${worldData.h}" role="group" aria-label="${esc(t('map.title'))}">${shapes}${dots}</svg>
    <p class="legend">${t('map.legend')}</p><p class="consent-small">${t('map.src', { s: esc(worldData.source) })}</p>`;
  const open = (e) => { const el = e.target.closest('[data-ix]'); const x = el && list.find((y) => y.id === el.dataset.ix); if (x) openIndexChart(x); };
  box.onclick = open;
  box.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } };
}

/* ---------- Actualités d'un actif (écran graphique) : titres Yahoo Finance, lien vers l'article d'origine ---------- */
function newsQuery(a) {
  if (!a) return null;
  if (a.kind === 'c') return `${a.label}-USD`;
  if (a.kind === 's') return a.assetId;
  return a.symbol || a.label;
}
function setupNews(asset, token) {
  const box = $('#chart-news-box'), out = $('#chart-news');
  const q = newsQuery(asset);
  box.hidden = !q;
  box.open = false;
  out.innerHTML = '';
  box.ontoggle = async () => {
    if (!box.open || out.dataset.token === String(token)) return;
    out.dataset.token = String(token);
    out.innerHTML = `<p class="mc-note">${t('loading')}</p>`;
    let d = null;
    try { const r = await fetch(`/api/news?q=${encodeURIComponent(q)}`); d = r.ok ? await r.json() : null; } catch { /* n/d */ }
    if (token !== chartToken) return;
    if (!d?.items?.length) { out.innerHTML = `<p class="mc-note">${t('news.na')}</p>`; return; }
    out.innerHTML = `<ul class="news">${d.items.map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a>
      <small>${esc(n.publisher || '')}${n.time ? ` · ${fmtDay(n.time)} ${fmtTime(n.time)}` : ''}</small></li>`).join('')}</ul>
      <p class="mc-note">${t('news.note', { s: esc(d.source) })}</p>`;
  };
}

/* ---------- Analyses de l'écran graphique : saisonnalité, simulateur, mon plan ---------- */
let anaTab = 'season';
function setupAnalyses(asset, token) {
  const box = $('#chart-ana-box'), out = $('#chart-ana');
  box.hidden = !asset;
  box.open = false;
  out.innerHTML = '';
  if (!asset) { box.ontoggle = null; return; }
  const draw = async () => {
    out.innerHTML = `<div class="seg seg-wide ana-tabs" role="group" aria-label="${esc(t('ana.title'))}">${[['season', t('ss.title')], ['sim', t('sim.title')], ['plan', t('plan.title')]].map(([k, l]) =>
      `<button type="button" data-ana="${k}" aria-pressed="${anaTab === k}">${esc(l)}</button>`).join('')}</div><div id="ana-body"><p class="mc-note">${t('loading')}</p></div>`;
    out.querySelectorAll('[data-ana]').forEach((b) => b.addEventListener('click', () => { anaTab = b.dataset.ana; draw(); }));
    const body = out.querySelector('#ana-body');
    if (anaTab === 'plan') { const q = quoteOf(asset); analysis.planSetup(body, asset, unitOf(asset.kind, q.ccy)); return; }
    if (anaTab === 'sim') { analysis.simSetup(body, asset); return; }
    const html = await analysis.seasonHTML(asset);
    if (token === chartToken && body.isConnected) body.innerHTML = html;
  };
  box.ontoggle = () => { if (box.open && out.dataset.token !== String(token)) { out.dataset.token = String(token); draw(); } };
}

/* ---------- Calendrier économique et dividendes (agenda de l'onglet Indices) ---------- */
let econData = null, econLoading = false, divData = null, divLoading = false;
async function loadEcon() {
  if (econLoading) return; econLoading = true;
  try { const r = await fetch('/api/econ'); econData = r.ok ? await r.json() : { error: true }; } catch { econData = { error: true }; }
  econLoading = false;
  if (state.tab === 'indices') renderAgenda();
}
async function loadDividends() {
  if (divLoading) return; divLoading = true;
  try { const r = await fetch('/api/dividends'); divData = r.ok ? await r.json() : { error: true }; } catch { divData = { error: true }; }
  divLoading = false;
  if (state.tab === 'indices') renderAgenda();
}
const ECON_CC = { 'United States': 'US', 'Euro Zone': 'EZ', France: 'FR', Germany: 'DE', 'United Kingdom': 'GB', Italy: 'IT', Spain: 'ES', China: 'CN', Japan: 'JP', Canada: 'CA', Switzerland: 'CH', Australia: 'AU' };
function countryName(nasdaqName) {
  const cc = ECON_CC[nasdaqName];
  try { return cc ? new Intl.DisplayNames([loc()], { type: 'region' }).of(cc) : nasdaqName; } catch { return nasdaqName; }
}
function econHTML(expanded) {
  if (!econData) return `<h3>${t('econ.title')}</h3><p class="mc-note">${t('loading')}</p>`;
  if (econData.error || !econData.events) return `<h3>${t('econ.title')}</h3><p class="mc-note">${t('econ.na')}</p>`;
  const now = Date.now();
  const upcoming = econData.events.filter((e) => (e.at ?? dayMs(e.date)) >= now - 2 * 3600_000);
  const shown = expanded ? upcoming.slice(0, 80) : upcoming.slice(0, 6);
  if (!shown.length) return `<h3>${t('econ.title')}</h3><p class="mc-note">${t('econ.none')}</p>`;
  const val = (k, v) => (v ? `${t(`econ.${k}`)} ${esc(v)}` : '');
  return `<h3>${t('econ.title')}</h3><ul>${shown.map((e) => `<li><span class="ag-badge">${esc(ECON_CC[e.country] === 'EZ' ? 'EU' : ECON_CC[e.country] || '?')}</span>
    <span class="mc-name"><strong>${esc(e.name)}</strong><small>${esc(countryName(e.country))}${[val('actual', e.actual), val('cons', e.consensus), val('prev', e.previous)].filter(Boolean).map((x) => ` · ${x}`).join('')}</small></span>
    <span class="ag-when"><b>${e.at ? fmtTime(e.at) : ND}</b><small>${e.at ? fmtDay(e.at) : fmtDay(dayMs(e.date), 'UTC')}</small></span></li>`).join('')}</ul>`;
}
function divHTML(expanded) {
  if (!divData) return '';
  if (divData.error || !divData.items) return `<h3>${t('div.title')}</h3><p class="mc-note">${t('div.na')}</p>`;
  const tracked = new Set([...(state.stocks?.companies || []).map((c) => c.id), ...favs.filter((f) => f.t === 's').map((f) => f.id)]);
  const items = divData.items.filter((x) => tracked.has(x.symbol) && x.exDate).sort((a, b) => a.exDate.localeCompare(b.exDate));
  const shown = expanded ? items : items.slice(0, 4);
  if (!shown.length) return `<h3>${t('div.title')}</h3><p class="mc-note">${t('div.none')}</p>`;
  return `<h3>${t('div.title')}</h3><ul>${shown.map((x) => {
    const c = stockById(x.symbol);
    const inner = `${c ? logoImg(c, 18, 'idx-logo') : '<span class="ag-badge earn">$</span>'}
      <span class="mc-name"><strong>${esc(x.symbol)} <small class="ag-co">${esc(x.name)}</small></strong><small>${isNum(x.amount) ? t('div.amount', { v: fmtNative(x.amount, 'USD') }) : ''}${x.payDate ? ` · ${t('div.pay', { d: fmtDay(dayMs(x.payDate), 'UTC') })}` : ''}</small></span>
      <span class="ag-when"><b>${fmtDay(dayMs(x.exDate), 'UTC')}</b><small>${inDays(x.exDate)}</small></span>`;
    return c ? `<li><button type="button" class="ag-item" data-sym="${esc(x.symbol)}">${inner}</button></li>` : `<li>${inner}</li>`;
  }).join('')}</ul>`;
}

/* ---------- Sentiment : Fear & Greed des cryptos (alternative.me) et VIX ---------- */
let sentiment = null, sentimentAt = 0, sentimentLoading = false;
async function loadSentiment() {
  if (sentimentLoading) return; sentimentLoading = true;
  try { const r = await fetch('/api/sentiment'); sentiment = r.ok ? await r.json() : { error: true }; if (r.ok) sentiment.offline = r.headers.get('X-SW-Cache') === '1'; } catch { sentiment = { error: true }; }
  sentimentAt = Date.now(); sentimentLoading = false;
  if (state.tab === 'accueil') renderHome();
}
const FNG_KEYS = { 'Extreme Fear': 'xfear', Fear: 'fear', Neutral: 'neutral', Greed: 'greed', 'Extreme Greed': 'xgreed' };
function sentimentHTML() {
  if (!sentiment || Date.now() - sentimentAt > 15 * 60_000) loadSentiment();
  const head = `<section class="card home-card"><h2>${t('sent.title')} ${glossBtn('fng')}</h2>`;
  if (!sentiment) return `${head}<p class="mc-note">${t('loading')}</p></section>`;
  if (sentiment.error) return `${head}<p class="mc-note">${t('sent.na')}</p></section>`;
  const f = sentiment.fng, v = sentiment.vix;
  const hist = f?.history || [];
  const spark = hist.length > 1 ? `<svg class="fng-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="${hist.map((p, i) => `${i ? 'L' : 'M'}${(i / (hist.length - 1) * 100).toFixed(1)},${(24 - p.value / 100 * 24).toFixed(1)}`).join('')}"/></svg>` : '';
  return `${head}
    ${f ? `<div class="fng"><div class="fng-top"><span>${t('sent.fng')}</span><b>${f.now.value}</b><span class="fng-lbl">${esc(t(`sent.${FNG_KEYS[f.now.label] || 'neutral'}`))}</span></div>
      <div class="fng-bar" role="img" aria-label="${esc(`${t('sent.fng')} ${f.now.value}/100`)}"><i style="left:${f.now.value}%"></i></div>
      <div class="fng-scale"><span>${t('sent.xfear')}</span><span>${t('sent.xgreed')}</span></div>${spark}
      <p class="mc-note">${t('sent.fngNote', { s: esc(f.source), d: fmtDay(f.now.time) })}</p></div>` : `<p class="mc-note">${t('sent.fng')} : ${ND}</p>`}
    ${v ? `<p class="home-line"><b>VIX</b> ${NF2.format(v.price)} <span class="${signClass(v.changePct)}">${fmtPct(v.changePct)}</span> ${glossBtn('vix')}<small>${t('sent.vixNote', { s: esc(v.source) })}</small></p>` : `<p class="mc-note">VIX : ${ND}</p>`}
    ${sentiment.offline ? `<p class="mc-note neg">${t('off.cached', { d: fmtDay(sentiment.fetchedAt), t: fmtTime(sentiment.fetchedAt) })}</p>` : ''}
  </section>`;
}

/* ---------- Filtre d'actions (screener) sur le top des entreprises chargé ---------- */
const screen = { sector: '', country: '', move: 'all', sort: 'cap', ...(store.get('screen') || {}) };
function renderScreener(box, data) {
  const all = stockItems(data);
  const sec = state.sectors?.sectors || {};
  const sectors = [...new Set(all.map((c) => sec[c.id]).filter(Boolean))].sort();
  const countries = [...new Set(all.map((c) => c.country).filter(Boolean))].sort((a, b) => country(a).localeCompare(country(b)));
  let rows = all.filter((c) => (!screen.sector || sec[c.id] === screen.sector) && (!screen.country || c.country === screen.country)
    && (screen.move === 'all' || (screen.move === 'up' ? c.changePct > 0 : screen.move === 'down' ? c.changePct < 0 : Math.abs(c.changePct) >= 2)));
  const by = { cap: (a, b) => (b.marketCap || 0) - (a.marketCap || 0), chgDesc: (a, b) => (b.changePct ?? -1e9) - (a.changePct ?? -1e9),
    chgAsc: (a, b) => (a.changePct ?? 1e9) - (b.changePct ?? 1e9), name: (a, b) => a.label.localeCompare(b.label) };
  rows = rows.sort(by[screen.sort] || by.cap);
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  box.innerHTML = `<div class="scr-filters">
      <label>${t('scr.sector')}<select class="lang-select" data-scr="sector">${opt('', t('scr.all'), screen.sector)}${sectors.map((x) => opt(x, sectorName(x), screen.sector)).join('')}</select></label>
      <label>${t('scr.country')}<select class="lang-select" data-scr="country">${opt('', t('scr.all'), screen.country)}${countries.map((x) => opt(x, country(x), screen.country)).join('')}</select></label>
      <label>${t('scr.move')}<select class="lang-select" data-scr="move">${[['all', t('scr.all')], ['up', t('scr.up')], ['down', t('scr.down')], ['big', t('scr.big')]].map(([v, l]) => opt(v, l, screen.move)).join('')}</select></label>
      <label>${t('fav.sort')}<select class="lang-select" data-scr="sort">${[['cap', t('scr.byCap')], ['chgDesc', t('fav.sort.chgDesc')], ['chgAsc', t('fav.sort.chgAsc')], ['name', t('fav.sort.name')]].map(([v, l]) => opt(v, l, screen.sort)).join('')}</select></label>
    </div>
    <p class="mc-note">${t('scr.count', { n: rows.length, m: all.length })}</p>
    <div class="table-wrap"><table class="scr-table"><thead><tr><th>${t('scr.company')}</th><th>${t('scr.sector')}</th><th class="num">${t('price')}</th><th class="num">${t('scr.chg')}</th><th class="num">${t('cap')}</th></tr></thead>
    <tbody>${rows.map((c) => `<tr data-id="${esc(c.id)}" tabindex="0"><td>${logoImg(c, 18, 'mv-logo')}<b>${esc(c.label)}</b><small>${esc(c.name)}${c.country ? ` · ${esc(country(c.country))}` : ''}</small></td>
      <td>${esc(sec[c.id] ? sectorName(sec[c.id]) : ND)}</td><td class="num">${fmtStockPrice(c.price, c.currency)}</td>
      <td class="num ${signClass(c.changePct)}">${fmtPct(c.changePct)}</td><td class="num">${fmtCap(c.marketCap)}</td></tr>`).join('')}</tbody></table></div>`;
  box.onchange = (e) => { const s = e.target.closest('[data-scr]'); if (!s) return; screen[s.dataset.scr] = s.value; store.set('screen', screen); renderScreener(box, data); };
  const open = (e) => { const tr = e.target.closest('tr[data-id]'); const c = tr && all.find((x) => x.id === tr.dataset.id); if (c) openStockRanked(c); };
  box.onclick = open;
  box.onkeydown = (e) => { if (e.key === 'Enter') open(e); };
}

/* ---------- Catégories de cryptos (CoinGecko) en heatmap ---------- */
let catsData = null, catsAt = 0, catsLoading = false;
async function loadCats() {
  if (catsLoading) return; catsLoading = true;
  try { const r = await fetch('/api/cryptocats'); catsData = r.ok ? await r.json() : { error: true }; } catch { catsData = { error: true }; }
  catsAt = Date.now(); catsLoading = false;
  if (state.tab === 'crypto') renderCrypto();
}
function renderCryptoCats(map) {
  if (!catsData || Date.now() - catsAt > 10 * 60_000) loadCats();
  $('#crypto-movers').innerHTML = '';
  if (!catsData || catsData.error) {
    map.style.height = '420px';
    map.innerHTML = `<div class="empty" style="position:absolute;inset:0;display:grid;place-items:center">${t(catsData ? 'cats.na' : 'loading')}</div>`;
    return;
  }
  const items = catsData.categories.map((c) => ({ ...c, label: c.name, price: c.marketCap }));
  renderTiles(map, items, {
    maxAbs: 6, period: t('over24h'), priceText: (c) => fmtCap(c.marketCap),
    onOpen: (c) => toast(t('cats.toast', { n: c.name, c: fmtCap(c.marketCap), p: fmtPct(c.changePct), top: c.top.map((id) => coinById(id)?.symbol || id).join(', ') })),
  });
  $('#crypto-movers').innerHTML = `<p class="mc-note">${t('cats.note', { s: esc(catsData.source) })}</p>`;
}

/* ---------- Favoris : tableau des performances (1 j, 1 sem., 1 mois, depuis le 1er janvier, 1 an) ---------- */
const perfCache = new Map(); // clé → { at, perf }
function favAsset(f) {
  if (f.t === 'i') { const x = state.indices?.indices?.find((y) => y.id === f.id); return x?.symbol ? { kind: 'i', assetId: f.id, label: f.label, symbol: x.symbol } : null; }
  if (f.t === 'm') { const m = macroById(f.id); return m?.symbol ? { kind: 'm', assetId: f.id, label: f.label, symbol: m.symbol } : null; }
  return { kind: f.t, assetId: f.id, label: f.label };
}
const favPerf = (f) => perfOf(favKey(f), favAsset(f));
/** Performances 1 semaine, 1 mois, depuis le 1er janvier et 1 an, d'après les bougies journalières (cache 30 min). */
async function perfOf(key, a) {
  const hit = perfCache.get(key);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.perf;
  let perf = null;
  if (a) {
    try {
      const d = await fetchCandles(a, '1d');
      const c = (d.candles || []).filter((x) => isNum(x[4]));
      if (c.length > 5) {
        const last = c[c.length - 1], nowS = last[0], close = last[4];
        const at = (sec) => { let v = null; for (const x of c) { if (x[0] <= sec) v = x[4]; else break; } return c[0][0] <= sec && isNum(v) ? (close / v - 1) * 100 : null; };
        perf = { w1: at(nowS - 7 * 86400), m1: at(nowS - 30 * 86400), ytd: at(Date.UTC(new Date(nowS * 1000).getUTCFullYear(), 0, 1) / 1000), y1: at(nowS - 365 * 86400) };
      }
    } catch { /* n/d */ }
  }
  perfCache.set(key, { at: Date.now(), perf });
  return perf;
}
function renderFavTable(grid, list) {
  renderPerfTable(grid, list.map((f) => ({ key: favKey(f), label: f.label, logo: f, chg: quoteOf({ kind: f.t, assetId: f.id, label: f.label }).chg, asset: favAsset(f), open: () => openFav(f) })),
    () => grid.isConnected && state.tab === 'favoris' && favView.mode === 'table');
}
/** Tableau de performances (favoris, indices d'une région) : variation du jour, 1 semaine, 1 mois, depuis le 1er janvier, 1 an. */
function renderPerfTable(grid, rows, isActive) {
  const cell = (v) => `<td class="num ${signClass(v)}">${isNum(v) ? fmtPct(v, 1) : '…'}</td>`;
  const row = (r, p) => {
    const pc = (k) => (p === undefined ? '<td class="num">…</td>' : p && isNum(p[k]) ? cell(p[k]) : `<td class="num">${ND}</td>`);
    return `<tr data-key="${esc(r.key)}" tabindex="0"><td>${logoImg(r.logo, 18, 'mv-logo')}<b>${esc(r.label)}</b>${r.sub ? ` <small>${esc(r.sub)}</small>` : ''}</td>${isNum(r.chg) ? cell(r.chg) : `<td class="num">${ND}</td>`}${pc('w1')}${pc('m1')}${pc('ytd')}${pc('y1')}</tr>`;
  };
  const draw = (perfs) => {
    grid.innerHTML = `<div class="table-wrap fav-table"><table class="scr-table"><thead><tr><th>${t('scr.asset')}</th><th class="num">${t('perf.d1')}</th><th class="num">${t('perf.w1')}</th>
      <th class="num">${t('perf.m1')}</th><th class="num">${t('perf.ytd')}</th><th class="num">${t('perf.y1')}</th></tr></thead>
      <tbody>${rows.map((r) => row(r, perfs.get(r.key))).join('')}</tbody></table></div><p class="mc-note">${t('perf.note')}</p>`;
  };
  const perfs = new Map();
  draw(perfs);
  const queue = [...rows];
  const worker = async () => { while (queue.length) { const r = queue.shift(); perfs.set(r.key, r.asset ? await perfOf(r.key, r.asset) : null); if (isActive()) draw(perfs); } };
  Promise.all([worker(), worker(), worker()]);
  grid.onclick = (e) => { const tr = e.target.closest('tr[data-key]'); rows.find((r) => r.key === tr?.dataset.key)?.open(); };
  grid.onkeydown = (e) => { if (e.key === 'Enter') grid.onclick(e); };
}


/* ---------- Mon portefeuille réel (saisie manuelle, valorisé aux cours de l'app) ---------- */
const portfolio = createPortfolio({
  t, store, esc, isNum, ND,
  quote: quoteOf, usdPer,
  money: (usd) => (prefs.cur === 'EUR' && eurRate() ? fmtNative(usd / eurRate(), 'EUR').replace(/\sEUR$/, ' €') : fmtNative(usd, 'USD')),
  price: priceIn, qty: (v) => (isNum(v) ? qtyNF().format(v) : ND), pct: (v) => fmtPct(v), NF1: () => NF1, pctSign,
  unit: (kind, ccy) => (kind === 'i' ? t('pt.pts') : !ccy || ccy === 'USD' ? '$' : ccy === 'USX' ? '¢' : ccy),
  logo: (a, size) => logoImg(a, size, 'pt-logo'), toast, parse: parseAmount, fmtInput, lang: () => getLang(),
  assets: allAssets, store, fetchCandles, day: (ms) => fmtDay(ms),
  fetchEvents: async (sym) => { const r = await fetch(`/api/events?sym=${encodeURIComponent(sym)}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); },
});

/* ---------- Analyses : courbe des taux, réseau Bitcoin, saisonnalité, simulateur, corrélations, calculatrices, plans ---------- */
const unitOf = (kind, ccy) => (kind === 'i' ? t('pt.pts') : !ccy || ccy === 'USD' ? '$' : ccy === 'USX' ? '¢' : ccy);
const analysis = createAnalysis({
  t, esc, isNum, ND, store, toast, signClass, pctSign, loc, getJSON, fetchCandles, fmtInput,
  pct: (v, d) => fmtPct(v, d),
  num: (v, p) => (isNum(v) ? new Intl.NumberFormat(loc(), { minimumFractionDigits: p, maximumFractionDigits: p }).format(v) : ND),
  day: (ms) => fmtDay(ms), time: (ms) => fmtTime(ms),
  gloss: (k) => glossBtn(k), parse: parseAmount, native: (v, c) => fmtNative(v, c),
  qty: (v) => (isNum(v) ? qtyNF().format(v) : ND),
});

/* ---------- Agents IA (comptes de démonstration publics, décisions générées par Claude) ---------- */
const agents = createAgents({
  t, esc, isNum, ND, getJSON, usdPer,
  quote: quoteOf,
  num: (v) => (isNum(v) ? fmtInput(v) : ND),
  price: priceIn,
  money: (v) => fmtNative(v, 'USD'),
  signed: (v) => (isNum(v) ? `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${fmtNative(Math.abs(v), 'USD')}` : ND),
  pct: (v) => fmtPct(v),
  day: (ms) => fmtDay(ms), time: (ms) => fmtTime(ms),
  myAccount: () => paper.info(),
});

/* ---------- Bot de paper trading en direct (comptes FTMO / Lucid simulés) ---------- */
const bot = createBot({
  t, esc, isNum, ND, getJSON,
  money: (v) => fmtNative(v, 'USD'),
  signed: (v) => (isNum(v) ? `${v > 0.004 ? '+' : v < -0.004 ? '−' : ''}${fmtNative(Math.abs(v), 'USD')}` : ND),
  pct: (v) => fmtPct(v),
  day: (ms) => fmtDay(ms), time: (ms) => fmtTime(ms),
  locale: () => loc(),
  tv: (frame, sym, interval, label) => mountTV(frame, sym, interval, label, { dark: true, side: true }),
});

/* ---------- Confort : bandeau des favoris, visite guidée, connexion ---------- */
const comfort = createComfort({
  t, esc, store, toast,
  tickerItems: () => favs.map((f) => {
    const q = quoteOf({ kind: f.t, assetId: f.id, label: f.label });
    return { key: favKey(f), label: f.label, price: isNum(q.price) ? priceIn(q.price, f.t, q.ccy) : ND, pct: fmtPct(q.chg), cls: signClass(q.chg) };
  }),
  openKey: (k) => { const f = favs.find((x) => favKey(x) === k); if (f) openFav(f); },
  onNetwork: (on) => { renderChrome(); if (on) refresh(); },
});

/* ---------- Lexique ---------- */
function glossBtn(key) {
  const g = (GLOSSARY[getLang()] || GLOSSARY.fr)[key];
  return g ? `<button type="button" class="gl-btn" data-gl="${key}" aria-label="${esc(t('gl.what', { t: g[0] }))}">?</button>` : '';
}
function openGloss(key) {
  const dict = GLOSSARY[getLang()] || GLOSSARY.fr;
  let dlg = $('#gloss');
  if (!dlg) {
    dlg = document.createElement('div');
    dlg.id = 'gloss'; dlg.className = 'snap'; dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true'); dlg.setAttribute('aria-labelledby', 'gloss-title');
    document.body.append(dlg);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) closeGloss(); });
  }
  const entries = key && dict[key] ? [[key, dict[key]]] : Object.entries(dict).sort((a, b) => a[1][0].localeCompare(b[1][0]));
  dlg.innerHTML = `<div class="snap-card alert-card"><h2 id="gloss-title">${key ? esc(dict[key][0]) : t('gl.title')}</h2>
    <dl class="gloss">${entries.map(([, [term, def]]) => `${key ? '' : `<dt>${esc(term)}</dt>`}<dd>${esc(def)}</dd>`).join('')}</dl>
    <p class="consent-small">${t('gl.note')} <a href="${legalPrefix()}/formation.html#glossaire">${t('fm.gloss')}</a></p>
    <div class="snap-actions">${key ? `<button type="button" class="btn" data-gl-all>${t('gl.all')}</button>` : ''}<button type="button" class="btn btn-primary" data-gl-close>${t('snap.close')}</button></div></div>`;
  dlg.querySelector('[data-gl-close]').onclick = closeGloss;
  dlg.querySelector('[data-gl-all]')?.addEventListener('click', () => openGloss());
  dlg.hidden = false;
  dlg.dataset.prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  dlg.querySelector('[data-gl-close]').focus();
}
function closeGloss() {
  const d = $('#gloss'); if (!d || d.hidden) return;
  d.hidden = true;
  document.body.style.overflow = d.dataset.prevOverflow || '';
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-gl]');
  if (!b) return;
  e.preventDefault(); e.stopPropagation();
  openGloss(b.dataset.gl);
}, true);

/* ---------- Taille du texte (zoom de l'interface, appliqué tôt par theme.js) ---------- */
const TEXT_SCALES = [0.9, 1, 1.15, 1.3];
const textScale = () => { const v = store.get('textScale'); return TEXT_SCALES.includes(v) ? v : 1; };
function setTextScale(z) {
  if (!TEXT_SCALES.includes(z)) return;
  store.set('textScale', z);
  document.documentElement.style.zoom = z === 1 ? '' : String(z);
  render();
}

/* ---------- Alertes automatiques de forts mouvements (favoris, seuil en %) ---------- */
function movesHTML() {
  const cur = alertsCache?.moves;
  return `<div class="home-summary"><h3>${t('mv.title')}</h3><p class="consent-small">${t('mv.intro')}</p>
    <div class="pt-join"><div class="alert-input"><input id="mv-pct" type="text" inputmode="decimal" value="${esc(cur ? NF1.format(cur.pct) : '5')}" aria-label="${esc(t('mv.pct'))}"><span>%</span></div>
      <button type="button" class="btn" data-mv-set="on">${t(cur ? 'sum.update' : 'sum.on')}</button>
      ${cur ? `<button type="button" class="btn" data-mv-set="off">${t('sum.off')}</button>` : ''}</div>
    <p class="consent-small">${cur ? t('mv.active', { p: NF1.format(cur.pct), n: cur.count }) : ''} <a href="${legalPrefix()}/confidentialite.html#resume">${t('alert.privacy')}</a></p></div>`;
}
function bindMoves(root) {
  root.querySelectorAll('[data-mv-set]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      if (b.dataset.mvSet === 'off') await alertsApi('moves.set', { token: store.get(ALERT_TOKEN), pct: null });
      else {
        const pct = parseAmount(root.querySelector('#mv-pct').value);
        if (!(isNum(pct) && pct >= 1 && pct <= 50)) { toast(t('mv.invalid'), 'neg'); b.disabled = false; return; }
        const sup = pushSupport();
        if (sup !== 'ok') { toast(t(sup === 'ios' ? 'alert.ios' : 'alert.unsupported'), 'neg'); b.disabled = false; return; }
        const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (perm !== 'granted') { toast(t('alert.denied'), 'neg'); b.disabled = false; return; }
        const token = await ensureDevice();
        await alertsApi('moves.set', { token, pct, assets: favs.slice(0, 30).map((f) => ({ kind: f.t, assetId: f.id, label: f.label })) });
        toast(t('mv.saved'));
      }
      await loadAlerts(true);
    } catch { toast(t('alert.error'), 'neg'); }
    if (state.tab === 'accueil') renderHome();
  }));
}

/* ---------- Rappels du calendrier (la veille) et résumé hebdomadaire (samedi), par notification ---------- */
function notifHTML() {
  const rem = alertsCache?.remind, wk = alertsCache?.weekly;
  const row = (key, cur, activeText) => `<div class="home-summary"><h3>${t(`${key}.title`)}</h3><p class="consent-small">${t(`${key}.intro`)}</p>
    <div class="pt-join"><button type="button" class="btn" data-nt="${key}:on">${t(cur ? 'sum.update' : 'sum.on')}</button>
      ${cur ? `<button type="button" class="btn" data-nt="${key}:off">${t('sum.off')}</button>` : ''}</div>
    <p class="consent-small">${cur ? activeText : ''} <a href="${legalPrefix()}/confidentialite.html#resume">${t('alert.privacy')}</a></p></div>`;
  return row('rem', rem, rem ? t('rem.active', { n: rem.count }) : '') + row('wk', wk, wk ? t('wk.active', { n: wk.count }) : '');
}
function bindNotif(root) {
  root.querySelectorAll('[data-nt]').forEach((b) => b.addEventListener('click', async () => {
    const [key, mode] = b.dataset.nt.split(':');
    const action = key === 'rem' ? 'remind.set' : 'weekly.set';
    b.disabled = true;
    try {
      if (mode === 'off') await alertsApi(action, { token: store.get(ALERT_TOKEN), on: false });
      else {
        const sup = pushSupport();
        if (sup !== 'ok') { toast(t(sup === 'ios' ? 'alert.ios' : 'alert.unsupported'), 'neg'); b.disabled = false; return; }
        const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
        if (perm !== 'granted') { toast(t('alert.denied'), 'neg'); b.disabled = false; return; }
        const token = await ensureDevice();
        let tz = 'UTC';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* UTC */ }
        if (key === 'rem') await alertsApi(action, { token, on: true, tz, syms: favs.filter((f) => f.t === 's').map((f) => f.id).filter((x) => /^[A-Z0-9.-]{1,12}$/.test(x)).slice(0, 30) });
        else await alertsApi(action, { token, on: true, tz, assets: favs.slice(0, 30).map((f) => { const a = favAsset(f); return a ? { kind: a.kind, assetId: a.assetId, label: f.label, ...(a.symbol ? { symbol: a.symbol } : {}) } : null; }).filter(Boolean) });
        toast(t(`${key}.saved`));
      }
      await loadAlerts(true);
    } catch { toast(t('alert.error'), 'neg'); }
    if (state.tab === 'accueil') renderHome();
  }));
}

/* ---------- Mode plein écran / TV : heatmap seule, mise à jour automatique, rotation Crypto ↔ Actions ---------- */
let tvTimer = 0, tvWake = null;
async function enterTV(kind) {
  setTab(kind === 'crypto' ? 'crypto' : 'actions');
  document.body.classList.add('tv');
  let bar = $('#tv-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'tv-bar'; bar.className = 'tv-bar';
    document.body.append(bar);
  }
  bar.innerHTML = `<strong>${t('appName')}</strong><span id="tv-clock"></span>
    <label class="pt-switch"><input type="checkbox" id="tv-rotate" ${store.get('tvRotate') ? 'checked' : ''}> ${t('tv.rotate')}</label>
    <button type="button" class="btn btn-sm" id="tv-exit">${t('tv.exit')}</button>`;
  bar.querySelector('#tv-exit').onclick = exitTV;
  bar.querySelector('#tv-rotate').onchange = (e) => store.set('tvRotate', e.target.checked);
  try { await document.documentElement.requestFullscreen?.(); } catch { /* plein écran refusé : le mode reste actif dans la fenêtre */ }
  try { tvWake = await navigator.wakeLock?.request('screen'); } catch { tvWake = null; }
  let n = 0;
  clearInterval(tvTimer);
  const tick = () => {
    const c = $('#tv-clock'); if (c) c.textContent = `${fmtDay(Date.now())} ${fmtTime(Date.now(), true)}`;
    if (++n % 30 === 0 && store.get('tvRotate')) setTab(state.tab === 'crypto' ? 'actions' : 'crypto');
  };
  tick();
  tvTimer = setInterval(tick, 1000);
  render();
}
function exitTV() {
  if (!document.body.classList.contains('tv')) return;
  document.body.classList.remove('tv');
  clearInterval(tvTimer);
  $('#tv-bar')?.remove();
  try { tvWake?.release(); } catch { /* rien */ }
  tvWake = null;
  if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  render();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('tv')) exitTV(); });
document.addEventListener('click', (e) => { const b = e.target.closest('[data-tv]'); if (b) enterTV(b.dataset.tv); });

/* ---------- Navigation ---------- */
function setTab(tab) {
  if (!TABS.includes(tab) || tab === state.tab) return;
  state.tab = tab;
  store.set('tab', tab);
  history.replaceState(null, '', `#${tab}`);
  window.scrollTo({ top: 0 });
  render();
}
document.querySelector('.tabbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});
$('#refresh').addEventListener('click', refresh);
// Raccourci de l'icône de l'app (manifeste) : « Rechercher un actif ».
if (new URLSearchParams(location.search).get('action') === 'search') setTimeout(openSearch, 400);

/* ---------- Liens depuis la formation NAS100 (/?go=ndx | demo | calc | taux | indices | gloss:<terme>) ---------- */
let pendingGo = new URLSearchParams(location.search).get('go');
if (pendingGo) history.replaceState(history.state, '', location.pathname + location.hash);
const goTab = (tab) => { if (state.tab === tab) render(); else setTab(tab); };
function runGo() {
  const g = pendingGo;
  if (!g) return;
  if (g === 'ndx') { // attend les données des indices
    const x = state.indices?.indices?.find((y) => y.id === 'ndx');
    if (!x) return;
    pendingGo = null;
    openIndexChart(x);
    return;
  }
  pendingGo = null;
  if (g === 'calc') analysis.openCalc();
  else if (g === 'demo') { prefs.compteView = 'demo'; store.set('prefs', prefs); goTab('compte'); }
  else if (g === 'taux') { prefs.region = 'taux'; store.set('prefs', prefs); goTab('indices'); }
  else if (g === 'indices') goTab('indices');
  else if (g.startsWith('gloss:')) openGloss(g.slice(6));
}
setTimeout(runGo, 400);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (comfort.tourOpen()) comfort.endTour();
  else if (analysis.calcOpen()) analysis.closeCalc();
  else if (!$('#search').hidden) closeSearch();
  else if ($('#conv') && !$('#conv').hidden) closeConverter();
  else if ($('#gloss') && !$('#gloss').hidden) closeGloss();
  else if (portfolio.isOpen()) portfolio.close();
  else if (document.body.classList.contains('tv')) exitTV();
  else if (paper.isOpen()) paper.closeModal();
  else if (!$('#alert').hidden) closeAlert();
  else if (!$('#snap').hidden) closeSnapshot();
  else if (!$('#chart').hidden) $('#chart-close').click();
});

/* ---------- Gestes : pull-to-refresh + balayage entre onglets ---------- */
(() => {
  const ptr = $('#ptr');
  let sx = 0, sy = 0, st = 0, pulling = false, pull = 0, active = false;
  const reset = () => {
    ptr.classList.add('settle');
    ptr.style.transform = ''; ptr.style.opacity = '';
    ptr.classList.remove('ready');
  };
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !$('#chart').hidden) { active = false; return; }
    active = true;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
    pulling = window.scrollY <= 0; pull = 0;
    ptr.classList.remove('settle');
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!active || !pulling) return;
    const dy = e.touches[0].clientY - sy, dx = e.touches[0].clientX - sx;
    if (dy <= 0 || Math.abs(dx) > dy) { pull = 0; ptr.style.opacity = '0'; return; }
    pull = Math.min(dy * 0.5, 110);
    ptr.style.transform = `translateY(${pull - 50}px) scale(${0.6 + Math.min(pull / 70, 1) * 0.4}) rotate(${pull * 3}deg)`;
    ptr.style.opacity = String(Math.min(pull / 50, 1));
    ptr.classList.toggle('ready', pull >= 70);
  }, { passive: true });
  window.addEventListener('touchend', async (e) => {
    if (!active) return;
    active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (pulling && pull >= 70) {
      ptr.classList.add('loading', 'settle');
      ptr.style.transform = 'translateY(14px) scale(1)';
      await refresh();
      ptr.classList.remove('loading');
      reset();
      return;
    }
    reset();
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - st < 600) {
      const i = TABS.indexOf(state.tab) + (dx < 0 ? 1 : -1);
      if (i >= 0 && i < TABS.length) setTab(TABS[i]);
    }
  }, { passive: true });
})();

/* ---------- Rafraîchissement auto (60 s, app visible uniquement) ---------- */
setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Date.now() - state.lastFetch > 30_000) refresh();
});
window.addEventListener('online', refresh);
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (state.tab === 'crypto') renderCrypto(); else if (state.tab === 'actions') renderStocks(); }, 120);
});

/* ---------- Installation (astuce iOS + bouton Android/desktop) ---------- */
(() => {
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone || store.get('installDismissed')) return;
  const box = $('#install');
  const close = `<button class="close" type="button" aria-label="${t('hide')}">✕</button>`;
  const bind = () => box.querySelector('.close').addEventListener('click', () => { box.hidden = true; store.set('installDismissed', true); });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    box.innerHTML = `<p>${t('installIOS')}</p>${close}`;
    box.hidden = false; bind();
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    box.innerHTML = `<p>${t('installPrompt')}</p><button class="go" type="button">${t('installBtn')}</button>${close}`;
    box.hidden = false; bind();
    box.querySelector('.go').addEventListener('click', async () => { box.hidden = true; e.prompt(); await e.userChoice; });
  });
})();

/* ---------- Mise à jour de l'app ---------- */
/**
 * Compare la version affichée à celle du serveur (/sw.js). Si elles diffèrent : installation de la nouvelle
 * version, puis rechargement. Filet de sécurité si l'ancienne version reste bloquée : caches vidés et
 * service worker réinstallé (au plus une fois par minute, pour ne jamais boucler).
 */
async function checkVersion(reg) {
  if (!navigator.onLine) return;
  let server;
  try {
    const txt = await (await fetch('/sw.js', { cache: 'no-store' })).text();
    server = Number(/VERSION = 'v(\d+)'/.exec(txt)?.[1]);
  } catch { return; }
  if (!server || server <= APP_BUILD) return;
  try { await reg.update(); } catch { /* on tente quand même le rechargement */ }
  let last = 0;
  try { last = Number(sessionStorage.getItem('marches:forcedUpdate')) || 0; } catch { /* rien */ }
  if (Date.now() - last < 60_000) return;
  try { sessionStorage.setItem('marches:forcedUpdate', String(Date.now())); } catch { /* rien */ }
  setTimeout(async () => {
    if (navigator.serviceWorker.controller && reg.active?.scriptURL && !reg.waiting && !reg.installing) {
      // La nouvelle version est active : un simple rechargement suffit.
    } else {
      try { for (const k of await caches.keys()) if (k.startsWith('marches-shell-')) await caches.delete(k); } catch { /* rien */ }
    }
    location.reload();
  }, 2500);
}

/* ---------- Démarrage ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').then((reg) => {
    // Une app installée (surtout sur iPhone) peut rester des jours en arrière-plan sans recharger la page :
    // on compare sa version à celle du serveur à chaque retour au premier plan, et toutes les 15 minutes.
    const check = () => checkVersion(reg);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 15 * 60_000);
    setTimeout(check, 3000);
  }).catch(() => {}));
  // Nouvelle version de l'app installée → rechargement unique pour l'afficher.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
}
applyStatic();
$('#app-version').textContent = `${t('version')} ${APP_VERSION}`;
render();
refresh();
comfort.bindTicker();
comfort.bindNetwork();
comfort.maybeTour();
