// Marchés — client PWA (vanilla JS, aucune dépendance).
import { getConsent, setConsent, SERVICES } from './consent.js';
const REFRESH_MS = 60_000;
const TABS = ['crypto', 'actions', 'ameriques', 'europe', 'asie', 'afrique'];
const TAB_TITLES = {
  crypto: 'Top 25 cryptos hors stablecoins · 24 h', actions: 'Top 25 entreprises mondiales · séance', ameriques: 'Indices Amériques', europe: 'Indices Europe',
  asie: 'Indices Asie-Pacifique', afrique: 'Indices Afrique & Moyen-Orient',
};
const LEGACY_TABS = { chine: 'asie', usa: 'ameriques' }; // anciens onglets (avant l'extension au monde entier)
const initialTab = (t) => (TABS.includes(t) ? t : LEGACY_TABS[t]);
const ND = 'n/d';

const $ = (sel) => document.querySelector(sel);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`marches:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`marches:${k}`, JSON.stringify(v)); } catch { /* quota / mode privé */ } },
};

const state = {
  tab: initialTab(location.hash.slice(1)) || initialTab(store.get('tab')) || 'crypto',
  crypto: store.get('crypto'),
  indices: store.get('indices'),
  stocks: store.get('stocks'),
  offline: { crypto: false, indices: false, stocks: false },
  loading: false,
  lastFetch: 0,
  prevPrices: new Map(),
};

/* ---------- Formatage ---------- */
const nf = (min, max = min) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max });
const NF0 = nf(0), NF1 = nf(1), NF2 = nf(2);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function fmtPct(v, digits = 2) {
  if (!isNum(v)) return ND;
  const s = (digits === 1 ? NF1 : NF2).format(Math.abs(v));
  const sign = v > 0.0049 ? '+' : v < -0.0049 ? '−' : '';
  return `${sign}${s} %`;
}
function fmtSigned(v) {
  if (!isNum(v)) return ND;
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${NF2.format(Math.abs(v))}`;
}
function fmtLevel(v) { return isNum(v) ? NF2.format(v) : ND; }
function fmtPrice(v) {
  if (!isNum(v)) return ND;
  const a = Math.abs(v);
  const f = a >= 1000 ? NF0 : a >= 1 ? NF2 : a >= 0.01 ? nf(4) : nf(2, 8);
  return `${f.format(v)} $`;
}
function fmtCap(v) {
  if (!isNum(v)) return ND;
  const md = v / 1e9;
  const f = md >= 100 ? NF0 : md >= 10 ? NF1 : NF2;
  return `${f.format(md)} Md$`;
}
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const timeSecFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
function fmtTime(ms, withSec = false) { return isNum(ms) ? (withSec ? timeSecFmt : timeFmt).format(ms) : ND; }
function fmtDay(ms, tz) {
  if (!isNum(ms)) return ND;
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  try { return new Intl.DateTimeFormat('fr-FR', tz ? { ...opts, timeZone: tz } : opts).format(ms); }
  catch { return new Intl.DateTimeFormat('fr-FR', opts).format(ms); }
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
  if (e.target instanceof HTMLImageElement && e.target.matches('.logo, .chart-logo')) e.target.remove();
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
function renderTiles(map, items, { maxAbs, priceText, period, onOpen }) {
  const { width, height } = sizeTreemap(map);
  const sorted = items.filter((c) => isNum(c.marketCap) && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((c) => ({ ...c, value: c.marketCap }));
  const rects = squarify(sorted, 0, 0, width, height);
  const total = sorted.reduce((s, c) => s + c.value, 0);

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
    const aria = `${r.name} (${r.label}) : ${fmtPct(r.changePct)} ${period}, prix ${priceText(r)}`;
    return `<button class="tile${flash}" role="listitem" data-id="${esc(r.id)}" aria-label="${esc(aria)}"
      style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background-color:${heat(r.changePct, maxAbs)}">${inner}</button>`;
  }).join('');
  for (const c of items) state.prevPrices.set(c.id, c.price);

  map.onclick = (e) => {
    const btn = e.target.closest('.tile');
    const i = btn ? sorted.findIndex((x) => x.id === btn.dataset.id) : -1;
    if (i >= 0) onOpen(sorted[i], i + 1, total);
  };
}

function heatmapPlaceholder(statsEl, map, what) {
  statsEl.innerHTML = Array.from({ length: 4 }, () => '<div class="stat skeleton" style="height:58px"></div>').join('');
  map.style.height = '420px';
  map.innerHTML = state.loading ? '<div class="skeleton" style="position:absolute;inset:0"></div>'
    : `<div class="empty" style="position:absolute;inset:0;display:grid;place-items:center">Données ${what} ${ND}</div>`;
}

const upDown = (list) => {
  const up = list.filter((c) => isNum(c.changePct) && c.changePct > 0).length;
  const down = list.filter((c) => isNum(c.changePct) && c.changePct < 0).length;
  const na = list.filter((c) => !isNum(c.changePct)).length;
  return `<div class="stat"><div class="stat-label">Hausse / baisse</div>
      <div class="stat-value"><span class="pos">▲ ${up}</span> · <span class="neg">▼ ${down}</span></div><div class="stat-sub">sur le top 25${na ? ` · ${na} ${ND}` : ''}</div></div>`;
};
const updated = (data) => `<div class="stat"><div class="stat-label">Mise à jour</div>
      <div class="stat-value">${fmtTime(data.fetchedAt, true)}</div><div class="stat-sub">${esc(data.source || ND)}${data.stale ? ' · ancien' : ''}</div></div>`;

function renderCrypto() {
  const data = state.crypto;
  const statsEl = $('#crypto-stats'), map = $('#treemap');
  if (!data?.coins?.length) return heatmapPlaceholder(statsEl, map, 'crypto');
  const g = data.global || {};
  statsEl.innerHTML = `
    <div class="stat"><div class="stat-label">Capitalisation totale</div>
      <div class="stat-value">${fmtCap(g.totalMarketCap)}</div><div class="stat-sub ${signClass(g.totalChangePct)}">${fmtPct(g.totalChangePct)} sur 24 h</div></div>
    <div class="stat"><div class="stat-label">Dominance BTC</div>
      <div class="stat-value">${isNum(g.btcDominance) ? `${NF1.format(g.btcDominance)}\u202f%` : ND}</div><div class="stat-sub">de la capitalisation</div></div>
    ${upDown(data.coins)}
    ${updated(data)}`;
  renderTiles(map, data.coins.map((c) => ({ ...c, label: c.symbol })), {
    maxAbs: 8, period: 'sur 24 h', priceText: (c) => fmtPrice(c.price), onOpen: openChart,
  });
}

/** Cours d'une action dans sa devise (symbole $ pour l'USD). */
function fmtStockPrice(v, cur) {
  if (!isNum(v)) return ND;
  if (!cur || cur === 'USD') return fmtPrice(v);
  return `${(Math.abs(v) >= 10000 ? NF0 : NF2).format(v)}\u00a0${esc(cur)}`;
}

function renderStocks() {
  const data = state.stocks;
  const statsEl = $('#stocks-stats'), map = $('#treemap-stocks');
  if (!data?.companies?.length) return heatmapPlaceholder(statsEl, map, 'entreprises');
  const list = data.companies;
  const total = list.reduce((s, c) => s + (isNum(c.marketCap) ? c.marketCap : 0), 0);
  const us = list.find((c) => /^(NASDAQ|NYSE):/.test(c.tv?.link || ''));
  const usState = us ? statusOf(us) : null;
  statsEl.innerHTML = `
    <div class="stat"><div class="stat-label">Capitalisation top 25</div>
      <div class="stat-value">${fmtCap(total)}</div><div class="stat-sub">mise à jour horaire</div></div>
    <div class="stat"><div class="stat-label">Wall Street</div>
      <div class="stat-value">${usState ? esc(usState.chip) : ND}</div><div class="stat-sub">${usState ? esc(usState.foot) : ''}</div></div>
    ${upDown(list)}
    ${updated(data)}`;
  renderTiles(map, list, {
    maxAbs: 4, period: 'sur la séance', priceText: (c) => fmtStockPrice(c.price, c.currency), onOpen: openStockChart,
  });
}

/* ---------- Écran graphique TradingView ---------- */
const tvCache = new Map(); // symbole → réponse /api/tv (ou promesse en cours)
let chartToken = 0;

function tvWidgetURL(tvSymbol, interval = '60') {
  let tz = 'Etc/UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* défaut UTC */ }
  const p = new URLSearchParams({
    symbol: tvSymbol, interval, theme: 'dark', style: '1', locale: 'fr', timezone: tz,
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
async function showChart({ titleHTML, sub, statsHTML, tv, label, missingMsg }) {
  const token = ++chartToken;
  const box = $('#chart'), frame = $('#chart-frame'), link = $('#chart-link'), note = $('#chart-note');
  $('#chart-title').innerHTML = titleHTML;
  $('#chart-sub').textContent = sub;
  $('#chart-stats').innerHTML = statsHTML;
  frame.innerHTML = '<div class="msg">Chargement du graphique…</div>';
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
    if (res.note) { note.textContent = res.note; note.hidden = false; }
    renderTVFrame(res, label, token);
  } else if (res?.error) {
    frame.innerHTML = `<div class="msg">Graphique indisponible pour le moment${navigator.onLine ? '' : ' (hors ligne)'}.<br>Réessayez dans un instant.</div>`;
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
    frame.innerHTML = `<iframe title="Graphique TradingView ${esc(label)}" src="${esc(tvWidgetURL(res.tv, res.interval))}" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    return;
  }
  const s = SERVICES.tradingview;
  frame.innerHTML = consent === false
    ? `<div class="msg consent-box">
        <p>Graphique désactivé : vous avez refusé le service <strong>TradingView</strong>.</p>
        <div class="consent-actions"><button type="button" class="btn" data-consent="accept">Autoriser TradingView</button></div>
        <p class="consent-small"><a href="/cookies.html">Gérer mes choix</a></p>
      </div>`
    : `<div class="msg consent-box" role="group" aria-labelledby="consent-title">
        <p id="consent-title"><strong>Ce graphique est fourni par TradingView.</strong></p>
        <p>S’il est affiché, TradingView recevra votre adresse IP et des informations techniques sur votre appareil, pourra mesurer votre utilisation du graphique et enregistrer des données sur votre appareil (traceurs).</p>
        <div class="consent-actions">
          <button type="button" class="btn" data-consent="refuse">Refuser</button>
          <button type="button" class="btn" data-consent="accept">Accepter</button>
        </div>
        <p class="consent-small">Choix conservé 6 mois, modifiable à tout moment dans <a href="/cookies.html">Gestion des cookies</a>. <a href="${esc(s.policy)}" target="_blank" rel="noopener">Politique de TradingView</a> · <a href="/confidentialite.html">Notre politique de confidentialité</a></p>
      </div>`;
  frame.querySelectorAll('[data-consent]').forEach((b) => b.addEventListener('click', () => {
    setConsent('tradingview', b.dataset.consent === 'accept');
    renderTVFrame(res, label, token);
  }));
}

function openChart(c, rank, totalTop) {
  showChart({
    titleHTML: `${logoImg(c, 28, 'chart-logo')}${esc(c.symbol)} <span class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</span>`,
    sub: `${c.name} · rang ${rank} · variation 24 h`,
    statsHTML: stat('Prix', fmtPrice(c.price)) + stat('Capitalisation', fmtCap(c.marketCap))
      + stat('Part top 25', isNum(c.marketCap) && totalTop ? `${NF1.format((c.marketCap / totalTop) * 100)} %` : ND),
    tv: resolveTV(c),
    label: c.symbol,
    missingMsg: `Graphique TradingView ${ND} pour ${esc(c.symbol)} :<br>cette crypto n’y est pas cotée.`,
  });
}

function openStockChart(c, rank, total) {
  const st = statusOf(c);
  showChart({
    titleHTML: `${logoImg(c, 28, 'chart-logo')}${esc(c.label)} <span class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</span>`,
    sub: `${c.name} · rang ${rank}${c.country ? ` · ${c.country}` : ''} · ${st.chip}`,
    statsHTML: stat('Cours', fmtStockPrice(c.price, c.currency)) + stat('Capitalisation', fmtCap(c.marketCap))
      + stat('Part top 25', isNum(c.marketCap) && total ? `${NF1.format((c.marketCap / total) * 100)}\u202f%` : ND),
    tv: c.tv || { tv: null },
    label: c.label,
    missingMsg: `Graphique ${ND} ici pour ${esc(c.name)} :<br>TradingView n’autorise pas cette place de cotation dans ce widget.<br>Il reste consultable sur leur site.`,
  });
}

/*
 * Symboles TradingView des indices, vérifiés dans le widget gratuit (nov. 2026).
 * Certains indices officiels y sont bloqués (licence) : on affiche alors un CFD ou un ETF
 * qui le suit, signalé à l'écran, et le lien « Ouvrir dans TradingView » mène à l'indice officiel.
 * Plusieurs indices officiels n'y sont disponibles qu'en journalier (interval: 'D').
 * tv: null → aucun graphique intégrable : seul le lien vers tradingview.com est proposé.
 */
const CFD = (name) => `Graphique : CFD qui suit le ${name} (l’indice officiel n’est pas disponible dans ce widget). Le niveau peut différer légèrement.`;
const ETF = (what) => `Graphique : ${what} (l’indice officiel n’est pas disponible dans ce widget). Prix de l’ETF en $, pas le niveau de l’indice.`;
const INDEX_TV = {
  // Amériques
  spx: { tv: 'CAPITALCOM:US500', link: 'SP:SPX', note: CFD('S&P 500') },
  ixic: { tv: 'NASDAQ:ONEQ', link: 'NASDAQ:IXIC', note: ETF('ETF Fidelity ONEQ qui réplique le Nasdaq Composite') },
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
  kospi: { tv: 'TSX:KORX', link: 'KRX:KOSPI', note: 'Graphique : ETF qui suit le KOSPI 200 (indice voisin du KOSPI, non disponible dans ce widget). Prix de l’ETF, pas le niveau de l’indice.' },
  taiex: { tv: 'INDEX:TAIEX', interval: 'D', link: 'TWSE:TAIEX' },
  nifty: { tv: 'NASDAQ:INDY', link: 'NSE:NIFTY', note: ETF('ETF iShares India 50 qui réplique le Nifty 50') },
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
    titleHTML: `${esc(ix.name)} <span class="${signClass(ix.changePct)}">${fmtPct(ix.changePct)}</span>`,
    sub: `${st.chip} · ${st.foot}`,
    statsHTML: stat('Niveau', fmtLevel(ix.price)) + stat('Variation', fmtSigned(ix.change), signClass(ix.change))
      + stat('Clôture préc.', fmtLevel(ix.prevClose)),
    tv: INDEX_TV[ix.id] || { tv: null },
    label: ix.name,
    missingMsg: `Graphique ${ND} ici pour ${esc(ix.name)} :<br>TradingView ne l’autorise pas dans ce widget.<br>Il reste consultable sur leur site.`,
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
  if (!pts || pts.length < 2) return `<div class="spark-empty">Courbe de séance ${ND}</div>`;
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
    case 'open': return { chip: 'Ouvert', cls: 'open', foot: `Cours de ${fmtTime(ix.lastTime)} · différé` };
    case 'break': return { chip: 'Pause', cls: 'break', foot: `Dernier cours ${sameLocalDay(ix.lastTime, Date.now()) ? fmtTime(ix.lastTime) : fmtDay(ix.lastTime, ix.timezone)}` };
    case 'closed': return ix.outdated
      ? { chip: 'Données anciennes', cls: 'break', foot: `Dernière donnée : ${fmtDay(ix.lastTime, ix.timezone)}` }
      : { chip: 'Fermé', cls: 'closed', foot: `Clôture ${fmtDay(ix.lastTime, ix.timezone)}` };
    default: return { chip: `Statut ${ND}`, cls: 'unknown', foot: isNum(ix.lastTime) ? `Cours du ${fmtDay(ix.lastTime, ix.timezone)}` : `Date ${ND}` };
  }
}

function renderIndices(region) {
  const grid = $(`#grid-${region}`);
  const list = state.indices?.indices?.filter((i) => i.region === region);
  if (!list?.length) {
    grid.innerHTML = state.loading ? Array.from({ length: 4 }, () => '<div class="idx skeleton"></div>').join('')
      : `<div class="empty" style="grid-column:1/-1">Données ${ND}</div>`;
    return;
  }
  grid.innerHTML = list.map((ix) => {
    const st = statusOf(ix);
    return `<article class="idx" data-id="${esc(ix.id)}" tabindex="0" role="button" aria-label="${esc(`${ix.name}, ${ix.country || ''} : ${fmtLevel(ix.price)}, ${fmtPct(ix.changePct)}. Ouvrir le graphique`)}" style="background-color:${heat(ix.changePct, 2.5)}">
      ${ix.country ? `<div class="idx-country">${esc(ix.country)}</div>` : ''}
      <div class="idx-top"><h3>${esc(ix.name)}</h3><span class="chip ${st.cls}">${st.chip}</span></div>
      <div class="idx-level">${fmtLevel(ix.price)}</div>
      <div class="idx-chg">${fmtPct(ix.changePct)} <span>(${fmtSigned(ix.change)})</span></div>
      ${sparkSVG(ix.spark, ix.prevClose)}
      <div class="idx-foot">${st.foot}</div>
    </article>`;
  }).join('');
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
  const key = state.tab === 'crypto' ? 'crypto' : state.tab === 'actions' ? 'stocks' : 'indices';
  const data = state[key];
  const when = data?.fetchedAt && key === 'indices' ? ` · MAJ ${fmtTime(data.fetchedAt)}` : '';
  $('#subtitle').textContent = `${TAB_TITLES[state.tab]}${when}`;

  const banner = $('#banner');
  let msg = '';
  if (state.offline[key] && data) msg = `Hors ligne ou source injoignable — dernières données du ${fmtDay(data.fetchedAt)} à ${fmtTime(data.fetchedAt)}.`;
  else if (state.offline[key]) msg = 'Hors ligne — aucune donnée en cache pour le moment.';
  else if (data?.stale) msg = `Source momentanément indisponible — données de ${fmtTime(data.fetchedAt)}.`;
  banner.textContent = msg;
  banner.hidden = !msg;

  const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  const crypto = state.crypto?.source === 'CoinPaprika'
    ? `${a('https://coinpaprika.com/', 'CoinPaprika')} (repli)` : `Powered by ${a('https://www.coingecko.com/', 'CoinGecko')}`;
  const idxSources = [...new Set((state.indices?.indices || []).map((i) => i.source).filter(Boolean))];
  const src = [
    `Crypto : ${crypto}`,
    `Indices : ${esc(idxSources.length ? idxSources.join(', ') : 'Yahoo Finance')} (cours différés)`,
    `Entreprises : classement ${a('https://companiesmarketcap.com/', 'companiesmarketcap.com')}, cours Yahoo Finance`,
    `Graphiques : ${a('https://www.tradingview.com/', 'TradingView')}`,
  ];
  $('#sources').innerHTML = `Sources — ${src.join(' · ')}.`;
}

function render() {
  for (const t of TABS) {
    $(`#view-${t}`).hidden = t !== state.tab;
    document.querySelector(`.tabbar [data-tab="${t}"]`).setAttribute('aria-current', t === state.tab ? 'page' : 'false');
  }
  renderChrome();
  if (state.tab === 'crypto') renderCrypto();
  else if (state.tab === 'actions') renderStocks();
  else renderIndices(state.tab);
}

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
  const [c, i, st] = await Promise.allSettled([getJSON('/api/crypto'), getJSON('/api/indices'), getJSON('/api/stocks')]);
  for (const [key, r] of [['crypto', c], ['indices', i], ['stocks', st]]) {
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
  if (e.key === 'Escape' && !$('#chart').hidden) $('#chart-close').click();
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
  const close = '<button class="close" type="button" aria-label="Masquer">✕</button>';
  const bind = () => box.querySelector('.close').addEventListener('click', () => { box.hidden = true; store.set('installDismissed', true); });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isIOS) {
    box.innerHTML = `<p>Installer l’app : touchez <strong>Partager</strong> puis <strong>« Sur l’écran d’accueil »</strong>.</p>${close}`;
    box.hidden = false; bind();
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    box.innerHTML = `<p>Installez Marchés sur votre écran d’accueil.</p><button class="go" type="button">Installer</button>${close}`;
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
render();
refresh();
