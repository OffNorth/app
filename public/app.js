// Marchés — client PWA (vanilla JS, aucune dépendance).
const REFRESH_MS = 60_000;
const TABS = ['crypto', 'chine', 'usa', 'europe'];
const TAB_TITLES = { crypto: 'Top 25 cryptos hors stablecoins · 24 h', chine: 'Indices Chine', usa: 'Indices USA', europe: 'Indices Europe' };
const ND = 'n/d';

const $ = (sel) => document.querySelector(sel);
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(`marches:${k}`)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`marches:${k}`, JSON.stringify(v)); } catch { /* quota / mode privé */ } },
};

const state = {
  tab: TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : store.get('tab') || 'crypto',
  crypto: store.get('crypto'),
  indices: store.get('indices'),
  offline: { crypto: false, indices: false },
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
function renderCrypto() {
  const data = state.crypto;
  const statsEl = $('#crypto-stats');
  const map = $('#treemap');
  if (!data?.coins?.length) {
    statsEl.innerHTML = Array.from({ length: 4 }, () => '<div class="stat skeleton" style="height:58px"></div>').join('');
    map.style.height = '420px';
    map.innerHTML = state.loading ? '<div class="skeleton" style="position:absolute;inset:0"></div>'
      : `<div class="empty" style="position:absolute;inset:0;display:grid;place-items:center">Données crypto ${ND}</div>`;
    return;
  }
  const coins = data.coins;
  const g = data.global || {};
  const up = coins.filter((c) => isNum(c.changePct) && c.changePct > 0).length;
  const down = coins.filter((c) => isNum(c.changePct) && c.changePct < 0).length;
  const na = coins.filter((c) => !isNum(c.changePct)).length;

  statsEl.innerHTML = `
    <div class="stat"><div class="stat-label">Capitalisation totale</div>
      <div class="stat-value">${fmtCap(g.totalMarketCap)}</div><div class="stat-sub ${signClass(g.totalChangePct)}">${fmtPct(g.totalChangePct)} sur 24 h</div></div>
    <div class="stat"><div class="stat-label">Dominance BTC</div>
      <div class="stat-value">${isNum(g.btcDominance) ? `${NF1.format(g.btcDominance)} %` : ND}</div><div class="stat-sub">de la capitalisation</div></div>
    <div class="stat"><div class="stat-label">Hausse / baisse</div>
      <div class="stat-value"><span class="pos">▲ ${up}</span> · <span class="neg">▼ ${down}</span></div><div class="stat-sub">sur le top 25${na ? ` · ${na} ${ND}` : ''}</div></div>
    <div class="stat"><div class="stat-label">Mise à jour</div>
      <div class="stat-value">${fmtTime(data.fetchedAt, true)}</div><div class="stat-sub">${esc(data.source || ND)}${data.stale ? ' · ancien' : ''}</div></div>`;

  // Dimensions : remplit l'écran restant, sans être trop plat ni trop haut.
  const width = map.clientWidth;
  const top = map.getBoundingClientRect().top + window.scrollY;
  const tabbar = $('.tabbar').offsetHeight;
  const avail = window.innerHeight - top - tabbar - 44;
  let height = width > 600 ? Math.max(420, Math.min(avail, width * 0.7)) : Math.min(Math.max(avail, 380, width), width * 1.9);
  height = Math.round(height);
  map.style.height = `${height}px`;

  const items = coins.filter((c) => isNum(c.marketCap) && c.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
    .map((c) => ({ ...c, value: c.marketCap }));
  const rects = squarify(items, 0, 0, width, height);
  const totalTop = items.reduce((s, c) => s + c.value, 0);

  map.innerHTML = rects.map((r) => {
    const base = Math.sqrt(r.w * r.h);
    let sym = Math.max(10, Math.min(30, base / 4.2));
    sym = Math.min(sym, (r.w - 6) / (Math.max(r.symbol.length, 2) * 0.68));
    const pct = Math.max(9, Math.min(18, sym * 0.62));
    const px = Math.max(9, Math.min(14, sym * 0.5));
    let inner = '';
    if (r.w >= 64 && r.h >= 58) {
      inner = `<span class="sym" style="font-size:${sym}px">${esc(r.symbol)}</span><span class="pct" style="font-size:${pct}px">${fmtPct(r.changePct)}</span><span class="px" style="font-size:${px}px">${fmtPrice(r.price)}</span>`;
    } else if (r.w >= 40 && r.h >= 34) {
      inner = `<span class="sym" style="font-size:${Math.min(sym, 15)}px">${esc(r.symbol)}</span><span class="pct" style="font-size:${Math.min(pct, 11)}px">${fmtPct(r.changePct, 1)}</span>`;
    } else if (r.w >= 24 && r.h >= 15) {
      inner = `<span class="sym" style="font-size:${Math.max(8, Math.min(sym, 11))}px">${esc(r.symbol)}</span>`;
    }
    const prev = state.prevPrices.get(r.id);
    const flash = isNum(prev) && isNum(r.price) && prev !== r.price ? ' flash' : '';
    const label = `${r.name} (${r.symbol}) : ${fmtPct(r.changePct)} sur 24 h, prix ${fmtPrice(r.price)}`;
    return `<button class="tile${flash}" role="listitem" data-id="${esc(r.id)}" aria-label="${esc(label)}"
      style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background-color:${heat(r.changePct, 8)}">${inner}</button>`;
  }).join('');
  for (const c of coins) state.prevPrices.set(c.id, c.price);

  map.onclick = (e) => {
    const btn = e.target.closest('.tile');
    if (!btn) return;
    const c = coins.find((x) => x.id === btn.dataset.id);
    if (c) openChart(c, coins.indexOf(c) + 1, totalTop);
  };
}

/* ---------- Écran graphique TradingView ---------- */
const tvCache = new Map(); // symbole → réponse /api/tv (ou promesse en cours)
let chartToken = 0;

function tvWidgetURL(tvSymbol) {
  let tz = 'Etc/UTC';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz; } catch { /* défaut UTC */ }
  const p = new URLSearchParams({
    symbol: tvSymbol, interval: '60', theme: 'dark', style: '1', locale: 'fr', timezone: tz,
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

async function openChart(c, rank, totalTop) {
  const token = ++chartToken;
  const box = $('#chart'), frame = $('#chart-frame'), link = $('#chart-link');
  $('#chart-title').innerHTML = `${esc(c.symbol)} <span class="${signClass(c.changePct)}">${fmtPct(c.changePct)}</span>`;
  $('#chart-sub').textContent = `${c.name} · rang ${rank} · variation 24 h`;
  $('#chart-stats').innerHTML = `
    <div class="stat"><div class="stat-label">Prix</div><div class="stat-value">${fmtPrice(c.price)}</div></div>
    <div class="stat"><div class="stat-label">Capitalisation</div><div class="stat-value">${fmtCap(c.marketCap)}</div></div>
    <div class="stat"><div class="stat-label">Part top 25</div><div class="stat-value">${isNum(c.marketCap) && totalTop ? `${NF1.format((c.marketCap / totalTop) * 100)} %` : ND}</div></div>`;
  frame.innerHTML = '<div class="msg">Chargement du graphique…</div>';
  link.hidden = true;
  if (box.hidden) {
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    history.pushState({ chart: true }, '');
  }

  const res = await resolveTV(c);
  if (token !== chartToken || box.hidden) return; // fermé ou autre tuile ouverte entre-temps
  if (res?.tv) {
    frame.innerHTML = `<iframe title="Graphique TradingView ${esc(c.symbol)}" src="${esc(tvWidgetURL(res.tv))}" allowfullscreen></iframe>`;
    link.href = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(res.tv)}`;
    link.hidden = false;
  } else if (res?.error) {
    frame.innerHTML = `<div class="msg">Graphique indisponible pour le moment${navigator.onLine ? '' : ' (hors ligne)'}.<br>Réessayez dans un instant.</div>`;
  } else {
    frame.innerHTML = `<div class="msg">Graphique TradingView ${ND} pour ${esc(c.symbol)} :<br>cette crypto n’y est pas cotée.</div>`;
  }
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
    case 'closed': return { chip: 'Fermé', cls: 'closed', foot: `Clôture ${fmtDay(ix.lastTime, ix.timezone)}` };
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
    return `<article class="idx" data-id="${esc(ix.id)}" tabindex="0" style="background-color:${heat(ix.changePct, 2.5)}">
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
    if (!ix) return;
    const st = statusOf(ix);
    openSheet(`
      <h2 id="sheet-title">${esc(ix.name)}</h2>
      <p class="muted">${st.chip} · ${st.foot}</p>
      <dl>
        <dt>Niveau</dt><dd>${fmtLevel(ix.price)}${ix.currency ? ` <small>${esc(ix.currency)}</small>` : ''}</dd>
        <dt>Variation du jour</dt><dd class="${signClass(ix.changePct)}">${fmtPct(ix.changePct)} (${fmtSigned(ix.change)})</dd>
        <dt>Clôture précédente</dt><dd>${fmtLevel(ix.prevClose)}</dd>
        <dt>Dernière cotation</dt><dd>${isNum(ix.lastTime) ? `${fmtDay(ix.lastTime)} ${fmtTime(ix.lastTime)}` : ND}</dd>
        <dt>Source</dt><dd>${esc(ix.source || ND)}</dd>
      </dl>`);
  };
}

/* ---------- En-tête, bannière ---------- */
function renderChrome() {
  const isCrypto = state.tab === 'crypto';
  const data = isCrypto ? state.crypto : state.indices;
  const when = data?.fetchedAt ? ` · MAJ ${fmtTime(data.fetchedAt)}` : '';
  $('#subtitle').textContent = `${TAB_TITLES[state.tab]}${isCrypto ? '' : when}`;

  const key = isCrypto ? 'crypto' : 'indices';
  const banner = $('#banner');
  let msg = '';
  if (state.offline[key] && data) msg = `Hors ligne ou source injoignable — dernières données du ${fmtDay(data.fetchedAt)} à ${fmtTime(data.fetchedAt)}.`;
  else if (state.offline[key]) msg = 'Hors ligne — aucune donnée en cache pour le moment.';
  else if (data?.stale) msg = `Source momentanément indisponible — données de ${fmtTime(data.fetchedAt)}.`;
  banner.textContent = msg;
  banner.hidden = !msg;

  const src = [];
  src.push(`Crypto : ${state.crypto?.source || 'CoinGecko'}${state.crypto?.source === 'CoinPaprika' ? ' (repli)' : ''}`);
  const idxSources = [...new Set((state.indices?.indices || []).map((i) => i.source).filter(Boolean))];
  src.push(`Indices : ${idxSources.length ? idxSources.join(', ') : 'Yahoo Finance'} (cours différés)`);
  src.push('Graphiques : TradingView');
  $('#sources').textContent = `Sources — ${src.join(' · ')}.`;
}

function render() {
  for (const t of TABS) {
    $(`#view-${t}`).hidden = t !== state.tab;
    document.querySelector(`.tabbar [data-tab="${t}"]`).setAttribute('aria-current', t === state.tab ? 'page' : 'false');
  }
  renderChrome();
  if (state.tab === 'crypto') renderCrypto();
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
  if (!state.crypto || !state.indices) render();
  const [c, i] = await Promise.allSettled([getJSON('/api/crypto'), getJSON('/api/indices')]);
  for (const [key, r] of [['crypto', c], ['indices', i]]) {
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

/* ---------- Feuille de détail ---------- */
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
}
$('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet' || e.target.closest('.sheet-grip')) $('#sheet').hidden = true; });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#chart').hidden) $('#chart-close').click();
  else $('#sheet').hidden = true;
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
    if (e.touches.length !== 1 || !$('#sheet').hidden || !$('#chart').hidden) { active = false; return; }
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
  resizeTimer = setTimeout(() => { if (state.tab === 'crypto') renderCrypto(); }, 120);
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
