// Marchés — client PWA (vanilla JS, aucune dépendance).
import { getConsent, setConsent, SERVICES } from './consent.js';
import { country, getLang, indexName, HTML_LANG, LANG_LABELS, LANGS, legalPrefix, LOCALES, setLang, t, TV_LOCALE } from './i18n.js';
import { makeSnapshot } from './snapshot.js';
const REFRESH_MS = 60_000;
const TABS = ['favoris', 'crypto', 'actions', 'ameriques', 'europe', 'asie', 'afrique'];
const LEGACY_TABS = { chine: 'asie', usa: 'ameriques' }; // anciens onglets (avant l'extension au monde entier)
const initialTab = (t) => (TABS.includes(t) ? t : LEGACY_TABS[t]);
const ND = 'n/d';

const $ = (sel) => document.querySelector(sel);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`marches:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`marches:${k}`, JSON.stringify(v)); } catch { /* quota / mode privé */ } },
};

// Réglages de l'utilisateur (mémorisés sur l'appareil).
const PREF_DEFAULT = { period: '24h', nCrypto: 25, nStocks: 25, cur: 'USD' };
const PREF_VALUES = { period: ['1h', '24h', '7d'], nCrypto: [25, 50, 100], nStocks: [25, 50, 100], cur: ['USD', 'EUR'] };
const prefs = { ...PREF_DEFAULT };
for (const [k, v] of Object.entries(store.get('prefs') || {})) if (PREF_VALUES[k]?.includes(v)) prefs[k] = v;

/* Favoris : { t: 'c' (crypto) | 's' (entreprise) | 'i' (indice), id, label, name, logo, logoSmall }, mémorisés sur l'appareil. */
const favKey = (f) => `${f.t}:${f.id}`;
let favs = (store.get('favs') || []).filter((f) => f && ['c', 's', 'i'].includes(f.t) && f.id);
const isFav = (f) => favs.some((x) => favKey(x) === favKey(f));
const hasStockFav = () => favs.some((f) => f.t === 's');
function toggleFav(f) {
  favs = isFav(f) ? favs.filter((x) => favKey(x) !== favKey(f)) : [...favs, f];
  store.set('favs', favs);
}
/** Taille du classement d'entreprises à charger : 100 si une entreprise est en favori (pour la retrouver). */
const stocksToLoad = () => (hasStockFav() ? 100 : prefs.nStocks);

const state = {
  fx: store.get('fx'),
  tab: initialTab(location.hash.slice(1)) || initialTab(store.get('tab')) || 'crypto',
  crypto: store.get('crypto'),
  indices: store.get('indices'),
  stocks: store.get('stocks'),
  offline: { crypto: false, indices: false, stocks: false, fx: false },
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
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
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
  if (e.target instanceof HTMLImageElement && e.target.matches('.logo, .chart-logo, .idx-logo')) e.target.remove();
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

function renderTiles(map, items, { maxAbs, priceText, period, onOpen, resize }) {
  const { width, height } = sizeTreemap(map);
  let sorted = items.filter((c) => isNum(c.marketCap) && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((c) => ({ ...c, value: c.marketCap }));
  if (resize) sorted = resize(sorted);
  const rects = squarify(sorted, 0, 0, width, height);
  const total = sorted.reduce((s, c) => s + c.marketCap, 0); // parts calculées sur la vraie capitalisation

  map.innerHTML = rects.map((r) => {
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
    const aria = `${r.name} (${r.label}) : ${fmtPct(r.changePct)} ${period}, ${t('priceWord')} ${priceText(r)}`;
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
      <div class="stat-value">${value}</div><div class="stat-sub ${s.cls || ''}">${esc(s.sub || '')}</div></div>`;
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
  renderTiles(map, cryptoItems(data), {
    maxAbs: PERIOD_MAX[prefs.period], period: t('period24h', { p: periodLabel() }), priceText: (c) => fmtPrice(c.price), onOpen: openChart, resize: shrinkBTC,
  });
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
    { label: t('wallStreet'), value: usState ? usState.chip : ND, sub: usState ? usState.foot : '' },
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
  renderTiles(map, stockItems(data), {
    maxAbs: 4, period: t('periodSession'), priceText: (c) => fmtStockPrice(c.price, c.currency), onOpen: openStockChart,
  });
}

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
  if (!res.ok) throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
  return body;
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
    alertsCache = { alerts: r.alerts || [], at: Date.now() };
  } catch {
    alertsCache = { alerts: alertsCache?.alerts || [], at: Date.now(), error: true };
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

function alertLine(a) {
  const cond = `${esc(a.label)} ${a.direction === 'above' ? '≥' : '≤'} ${fmtNative(a.target, a.currency)}`;
  const st = a.triggeredAt
    ? t('alert.fired', { d: fmtDay(Date.parse(a.triggeredAt)), p: fmtNative(a.triggeredPrice, a.currency) })
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
function updateAlertDir() {
  const a = alertAsset;
  const v = parseAmount($('#alert-target').value);
  const out = $('#alert-dir');
  if (!isNum(v) || !isNum(a?.price) || v === a.price) { out.textContent = ''; return; }
  out.textContent = t(v > a.price ? 'alert.above' : 'alert.below', { t: fmtNative(v, a.currency) });
}
async function openAlert(a) {
  alertAsset = a;
  $('#alert-title').textContent = t('alert.title', { l: a.label });
  $('#alert-now').textContent = t('alert.now', { p: fmtNative(a.price, a.currency) });
  $('#alert-unit').textContent = a.currency === 'USD' ? '$' : a.currency || t('alert.points');
  $('#alert-note').textContent = a.currency === 'USD' && eurRate() ? t('alert.usdNote') : '';
  const input = $('#alert-target');
  input.value = '';
  input.placeholder = isNum(a.price) ? NF2.format(a.price) : '';
  $('#alert-dir').textContent = '';
  alertMsg(isNum(a.price) ? null : 'alert.noPrice');
  $('#alert-submit').disabled = !isNum(a.price);
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
$('#alert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = alertAsset;
  const target = parseAmount($('#alert-target').value);
  if (!a || !isNum(a.price)) return alertMsg('alert.noPrice');
  if (!isNum(target) || target <= 0) return alertMsg('alert.invalid');
  if (target === a.price) return alertMsg('alert.same');
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
    await alertsApi('create', { token, alert: { kind: a.kind, assetId: a.assetId, label: a.label, direction: target > a.price ? 'above' : 'below', target, currency: a.currency } });
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

function showSnapshot(blob, name) {
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

function tvWidgetURL(tvSymbol, interval = '60') {
  let tz = 'Etc/UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* défaut UTC */ }
  const p = new URLSearchParams({
    symbol: tvSymbol, interval, theme: 'dark', style: '1', locale: TV_LOCALE[getLang()], timezone: tz,
    toolbarbg: '0b0f14', hidesidetoolbar: '1', symboledit: '0', saveimage: '0', withdateranges: '1',
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
async function showChart({ titleHTML, sub, statsHTML, tv, label, missingMsg, fav, alert }) {
  const token = ++chartToken;
  $('#chart-alert').onclick = () => openAlert(alert);
  const favBtn = $('#chart-fav');
  renderFavBtn(fav);
  favBtn.onclick = () => {
    toggleFav(fav);
    renderFavBtn(fav);
    if (fav.t === 's' && (state.stocks?.companies?.length ?? 0) < stocksToLoad()) loadStocks();
    if (state.tab === 'favoris') renderFavs();
  };
  const box = $('#chart'), frame = $('#chart-frame'), link = $('#chart-link'), note = $('#chart-note');
  $('#chart-title').innerHTML = titleHTML;
  $('#chart-sub').textContent = sub;
  $('#chart-stats').innerHTML = statsHTML;
  frame.innerHTML = `<div class="msg">${t('chartLoading')}</div>`;
  link.hidden = true;
  note.hidden = true;
  if (box.hidden) {
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    history.pushState({ chart: true }, '');
  }

  const res = await tv;
  if (token !== chartToken || box.hidden) return; // fermé ou autre tuile ouverte entre-temps
  if (res?.tv) {
    link.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(res.link || res.tv)}`;
    link.hidden = false;
    if (res.note) { note.textContent = typeof res.note === 'function' ? res.note() : res.note; note.hidden = false; }
    renderTVFrame(res, label, token);
  } else if (res?.error) {
    frame.innerHTML = `<div class="msg">${t('chartUnavailable', { off: navigator.onLine ? '' : t('offlineSuffix') })}</div>`;
  } else {
    frame.innerHTML = `<div class="msg">${missingMsg}</div>`;
    if (res?.link) { // pas de graphique intégrable, mais l'indice existe sur tradingview.com
      link.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(res.link)}`;
      link.hidden = false;
    }
  }
}

/**
 * Affiche le widget TradingView seulement si l'utilisateur l'a accepté.
 * Sans choix : panneau de consentement (Accepter / Refuser, même poids visuel).
 * Refus : aucune requête vers TradingView ; le lien « Ouvrir dans TradingView » reste disponible.
 */
function renderTVFrame(res, label, token) {
  if (token !== chartToken || $('#chart').hidden) return;
  const frame = $('#chart-frame');
  const consent = getConsent('tradingview');
  if (consent === true) {
    frame.innerHTML = `<iframe title="TradingView — ${esc(label)}" src="${esc(tvWidgetURL(res.tv, res.interval))}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
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
    renderTVFrame(res, label, token);
  }));
}

function openChart(c, rank, totalTop, count) {
  showChart({
    titleHTML: `${logoImg(c, 28, 'chart-logo')}${esc(c.symbol)} <span class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</span>`,
    sub: `${c.name} · ${t('rank', { n: rank })} · ${t('change24', { p: periodLabel() })}`,
    statsHTML: stat(t('price'), fmtPrice(c.price)) + stat(t('cap'), fmtCap(c.marketCap))
      + stat(t('share', { n: count }), isNum(c.marketCap) && totalTop ? `${NF1.format((c.marketCap / totalTop) * 100)}${pctSign()}` : ND),
    tv: resolveTV(c),
    label: c.symbol,
    missingMsg: t('missCrypto', { s: esc(c.symbol) }),
    fav: { t: 'c', id: c.id, label: c.symbol, name: c.name, logo: c.logo, logoSmall: c.logoSmall },
    alert: { kind: 'c', assetId: c.id, label: c.symbol, price: c.price, currency: 'USD' },
  });
}

function openStockChart(c, rank, total, count) {
  const st = statusOf(c);
  showChart({
    titleHTML: `${logoImg(c, 28, 'chart-logo')}${esc(c.label)} <span class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</span>`,
    sub: `${c.name} · ${t('rank', { n: rank })}${c.country ? ` · ${country(c.country)}` : ''} · ${st.chip}`,
    statsHTML: stat(t('quote'), fmtStockPrice(c.price, c.currency)) + stat(t('cap'), fmtCap(c.marketCap))
      + stat(t('share', { n: count }), isNum(c.marketCap) && total ? `${NF1.format((c.marketCap / total) * 100)}${pctSign()}` : ND),
    tv: c.tv || { tv: null },
    label: c.label,
    missingMsg: t('missStock', { s: esc(c.name) }),
    fav: { t: 's', id: c.id, label: c.label, name: c.name, logo: c.logo, logoSmall: c.logoSmall },
    alert: { kind: 's', assetId: c.id, label: c.label, price: c.price, currency: c.currency || null },
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
    alert: { kind: 'i', assetId: ix.id, label: ix.name, price: ix.outdated ? null : ix.price, currency: null },
  });
}

function closeChart() {
  const box = $('#chart');
  if (box.hidden) return;
  chartToken++;
  box.hidden = true;
  $('#chart-frame').innerHTML = ''; // décharge le widget
  document.body.style.overflow = '';
}
$('#chart-close').addEventListener('click', () => {
  if (history.state?.chart) history.back(); // déclenche popstate → closeChart
  else closeChart();
});
window.addEventListener('popstate', closeChart);

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
    </article>`;
}

/** Carte d'un favori crypto ou entreprise (même présentation que les indices). */
function assetCardHTML({ key, kicker, f, title, chip, price, pct, maxAbs, foot }) {
  return `<article class="idx" data-id="${esc(key)}" tabindex="0" role="button" aria-label="${esc(`${f.name} (${title}) : ${price}, ${fmtPct(pct)}. ${t('openChart')}`)}" style="background-color:${heat(pct, maxAbs)}">
      <div class="idx-country">${logoImg(f, 20, 'idx-logo')}<span>${esc(kicker)}</span></div>
      <div class="idx-top"><h3>${esc(title)}</h3>${chip ? `<span class="chip ${chip.cls}">${chip.chip}</span>` : ''}</div>
      <div class="idx-name">${esc(f.name)}</div>
      <div class="idx-level">${price}</div>
      <div class="idx-chg">${fmtPct(pct)}</div>
      <div class="idx-foot">${foot}</div>
    </article>`;
}

/* ---------- Favoris ---------- */
function findCoin(f) {
  const coins = state.crypto?.coins || [];
  const i = coins.findIndex((c) => c.id === f.id);
  return i >= 0 ? i : coins.findIndex((c) => c.symbol === f.label); // id différent selon la source (CoinGecko / CoinPaprika)
}
function renderFavs() {
  renderFavAlerts();
  const grid = $('#grid-favoris');
  if (!favs.length) {
    grid.innerHTML = `<div class="empty fav-empty">${t('fav.empty')}</div>`;
    grid.onclick = null;
    return;
  }
  const field = PERIOD_FIELD[prefs.period];
  const actions = new Map();
  grid.innerHTML = favs.map((f) => {
    const key = favKey(f);
    if (f.t === 'i') {
      const ix = state.indices?.indices?.find((x) => x.id === f.id);
      if (ix) { actions.set(key, () => openIndexChart(ix)); return indexCardHTML(ix, key); }
      return assetCardHTML({ key, kicker: t('fav.index'), f: { ...f, name: f.name }, title: f.label, price: ND, pct: null, maxAbs: 2.5, foot: state.loading ? t('loading') : t('noData') });
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
    const c = i >= 0 ? list[i] : null;
    if (!c) return assetCardHTML({ key, kicker: t('fav.stock'), f, title: f.label, price: ND, pct: null, maxAbs: 4, foot: state.loading ? t('loading') : t('fav.missingStock') });
    const top = stockItems(state.stocks);
    const total = top.reduce((s, x) => s + (isNum(x.marketCap) ? x.marketCap : 0), 0);
    actions.set(key, () => openStockChart(c, i + 1, i < top.length ? total : null, top.length));
    const st = statusOf(c);
    return assetCardHTML({ key, kicker: `${c.country ? country(c.country) : t('fav.stock')} · ${t('rank', { n: i + 1 })}`, f: c, title: c.label, chip: st,
      price: fmtStockPrice(c.price, c.currency), pct: c.changePct, maxAbs: 4, foot: st.foot });
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
  const grid = $(`#grid-${region}`);
  const list = state.indices?.indices?.filter((i) => i.region === region);
  if (!list?.length) {
    grid.innerHTML = state.loading ? Array.from({ length: 4 }, () => '<div class="idx skeleton"></div>').join('')
      : `<div class="empty" style="grid-column:1/-1">${t('noData')}</div>`;
    return;
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
  const key = state.tab === 'actions' ? 'stocks' : ['crypto', 'favoris'].includes(state.tab) ? 'crypto' : 'indices';
  const data = state[key];
  const when = data?.fetchedAt && (key === 'indices' || state.tab === 'favoris') ? ` · ${t('updatedShort')} ${fmtTime(data.fetchedAt)}` : '';
  const n = state.tab === 'crypto' ? cryptoItems(state.crypto).length || prefs.nCrypto : stockItems(state.stocks).length || prefs.nStocks;
  $('#subtitle').textContent = `${t(`title.${state.tab}`, { n, p: periodLabel() })}${when}`;

  const banner = $('#banner');
  let msg = '';
  if (state.offline[key] && data) msg = t('offlineData', { d: fmtDay(data.fetchedAt), t: fmtTime(data.fetchedAt) });
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
  for (const t of TABS) {
    $(`#view-${t}`).hidden = t !== state.tab;
    document.querySelector(`.tabbar [data-tab="${t}"]`).setAttribute('aria-current', t === state.tab ? 'page' : 'false');
  }
  renderChrome();
  if (state.tab === 'crypto') renderCrypto();
  else if (state.tab === 'actions') renderStocks();
  else if (state.tab === 'favoris') renderFavs();
  else renderIndices(state.tab);
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
  for (const el of document.querySelectorAll('[data-legal]')) el.href = `${legalPrefix(l)}/${el.dataset.legal}.html`;
  const sel = $('#lang');
  if (sel && !sel.options.length) sel.innerHTML = LANGS.map((x) => `<option value="${x}">${LANG_LABELS[x]}</option>`).join('');
  if (sel) sel.value = l;
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
  const [c, i, st, fx] = await Promise.allSettled([
    getJSON('/api/crypto'), getJSON('/api/indices'), getJSON(`/api/stocks?n=${stocksToLoad()}`), getJSON('/api/fx'),
  ]);
  for (const [key, r] of [['crypto', c], ['indices', i], ['stocks', st], ['fx', fx]]) {
    if (r.status === 'fulfilled' && !r.value.body.error) {
      state[key] = r.value.body;
      state.offline[key] = r.value.fromCache;
      if (!r.value.fromCache) store.set(key, r.value.body);
    } else {
      state.offline[key] = true;
    }
  }
  state.loading = false;
  state.lastFetch = Date.now();
  $('#refresh').classList.remove('spinning');
  render();
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

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#alert').hidden) closeAlert();
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

/* ---------- Démarrage ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  // Nouvelle version de l'app installée → rechargement unique pour l'afficher.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload(); }
  });
}
applyStatic();
render();
refresh();
