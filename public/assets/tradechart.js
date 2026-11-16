// Graphique de trading (mode démo) : bougies, positions, ordres, TP / SL déplaçables, ordre au doigt.
// Bibliothèque : TradingView Lightweight Charts™ (Apache 2.0), servie par le site lui-même :
// aucun appel à un tiers, pas de consentement requis. Logo d'attribution TradingView affiché sur le graphique.

import { macd, rsi, sma } from './indicators.js';

const LIB = '/vendor/lightweight-charts/lightweight-charts.standalone.production.js';
export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];
const TF_SEC = { '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const C = { up: '#22c55e', down: '#f05252', entry: '#7cc4ff', liq: '#f5b84a', order: '#b0b8c4', tap: '#e8eef4' };
const C_LIGHT = { ...C, entry: '#0a66c2', liq: '#a15c07', order: '#566372', tap: '#101820' };
const lines = () => (document.documentElement.dataset.theme === 'light' ? C_LIGHT : C);
export const INDICATORS = ['ma20', 'ma50', 'vol', 'rsi', 'macd', 'ev']; // ev : repères des dividendes et résultats (actions)
/** Couleurs du graphique selon le thème (variables CSS de la page). */
function themeOpts() {
  const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const light = document.documentElement.dataset.theme === 'light';
  const grid = light ? '#e6ebf1' : '#1b2430';
  return {
    layout: { background: { type: 'solid', color: v('--surface') || '#121921' }, textColor: v('--muted') || '#8d9aab' },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: v('--border') || '#232d39' },
    timeScale: { borderColor: v('--border') || '#232d39' },
  };
}
const IC = { ma20: '#f5b84a', ma50: '#b48cff', rsi: '#7cc4ff', macd: '#7cc4ff', signal: '#f5b84a' };

/* ---------- Indicateurs (calculés sur les clôtures) ---------- */


let libPromise = null;
function loadLib() {
  if (window.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LIB;
    s.onload = () => resolve(window.LightweightCharts);
    s.onerror = () => { libPromise = null; reject(new Error('lightweight-charts')); };
    document.head.append(s);
  });
  return libPromise;
}

// Heure locale de l'appareil sur l'axe (la bibliothèque affiche les horodatages tels quels, en UTC).
const local = (sec) => sec - new Date(sec * 1000).getTimezoneOffset() * 60;

export function createTradeChart(ctx) {
  const { t, esc, isNum } = ctx;
  let cur = null;
  let token = 0;
  let suppressClick = 0;

  /* Comparaison avec un autre actif : les deux courbes en % depuis le début de la période affichée (échelle en pourcentage). */
  let compareWith = null; // { forKey, key, asset }
  const keyOf = (a) => `${a.kind}:${a.assetId}`;
  async function applyCompare() {
    if (!cur?.chart) return;
    const { chart, LWC } = cur;
    if (cur.cmpSeries) { try { chart.removeSeries(cur.cmpSeries); } catch { /* déjà retirée */ } cur.cmpSeries = null; }
    const other = compareWith && compareWith.forKey === keyOf(cur.asset) ? compareWith.asset : null;
    chart.priceScale('right').applyOptions({ mode: other ? LWC.PriceScaleMode.Percentage : LWC.PriceScaleMode.Normal });
    const lbl = cur.el.querySelector('#tc-cmp-l');
    if (lbl) lbl.textContent = other ? t('tc.cmpNote') : '';
    if (!other) return;
    const my = token;
    let data = null;
    try { data = await ctx.fetchCandles(other, cur.tf); } catch { /* n/d */ }
    if (my !== token || !cur?.chart) return;
    if (!data?.candles?.length) { if (lbl) lbl.textContent = t('tc.cmpNa'); return; }
    const first = cur.bars[0]?.time ?? 0;
    const pts = data.candles.map((c) => ({ time: local(c[0]), value: c[4] })).filter((x) => x.time >= first);
    cur.cmpSeries = chart.addSeries(LWC.LineSeries, { color: '#b48cff', lineWidth: 2, priceLineVisible: false, lastValueVisible: true, title: other.label });
    cur.cmpSeries.setData(pts);
  }

  function unmount() {
    token++;
    if (cur?.chart) cur.chart.remove();
    cur = null;
  }

  async function mount(el, asset) {
    unmount();
    const my = token;
    const tf = ctx.getTf();
    el.innerHTML = `<div class="tc">
      <div class="tc-bar"><div class="seg" role="group" aria-label="${esc(t('tc.tf'))}">${TIMEFRAMES.map((x) =>
        `<button type="button" data-tf="${x}" aria-pressed="${x === tf}">${t(`tc.tf.${x}`)}</button>`).join('')}</div>
        <span class="tc-src" id="tc-src"></span></div>
      <div class="tc-ind" role="group" aria-label="${esc(t('tc.ind'))}">${INDICATORS.filter((k) => k !== 'ev' || asset.kind === 's').map((k) =>
        `<button type="button" data-ind="${k}" aria-pressed="${ctx.getInd().includes(k)}">${t(`tc.ind.${k}`)}</button>`).join('')}</div>
      <div class="tc-cmp"><label for="tc-cmp-sel">${t('tc.cmp')}</label>
        <select id="tc-cmp-sel" class="lang-select"><option value="">${t('tc.cmpNone')}</option>${ctx.compareList().filter((x) => x.key !== keyOf(asset)).map((x) =>
          `<option value="${esc(x.key)}"${compareWith?.forKey === keyOf(asset) && compareWith.key === x.key ? ' selected' : ''}>${esc(x.label)}${x.name ? ` · ${esc(x.name)}` : ''}</option>`).join('')}</select>
        <span class="tc-cmp-l" id="tc-cmp-l"></span></div>
      <div class="tc-draw" role="group" aria-label="${esc(t('draw.label'))}"><span>${t('draw.label')}</span>${[['h', t('draw.h')], ['t', t('draw.t')], ['f', t('draw.f')]].map(([k, l]) =>
        `<button type="button" data-draw="${k}" aria-pressed="false">${l}</button>`).join('')}<button type="button" data-draw="clear">${t('draw.clear')}</button></div>
      <div class="tc-chart" id="tc-chart"><div class="msg">${t('chartLoading')}</div></div>
      <div class="tc-pop" id="tc-pop" hidden></div>
      <p class="tc-hint">${t('tc.hint')}</p>
      <div class="tc-actions"><button type="button" class="btn btn-buy" data-side="long">${t('pt.buy')}</button>
        <button type="button" class="btn btn-sell" data-side="short">${t('pt.sell')}</button></div>
    </div>`;
    cur = { asset, el, tf, lines: [], tap: null };
    el.querySelectorAll('[data-tf]').forEach((b) => b.addEventListener('click', () => { ctx.setTf(b.dataset.tf); mount(el, asset); }));
    el.querySelectorAll('[data-side]').forEach((b) => b.addEventListener('click', () => ctx.openTicket(asset, { side: b.dataset.side })));
    el.querySelectorAll('[data-draw]').forEach((b) => b.addEventListener('click', () => {
      if (!cur) return;
      if (b.dataset.draw === 'clear') {
        if (!ctx.getDraw(keyOf(asset)).length || !confirm(t('draw.clearConfirm'))) return;
        ctx.setDraw(keyOf(asset), []); cur.drawMode = null; cur.drawP1 = null; renderDrawings(); setDrawButtons(); return;
      }
      cur.drawMode = cur.drawMode === b.dataset.draw ? null : b.dataset.draw;
      cur.drawP1 = null;
      setDrawButtons();
      if (cur.drawMode) ctx.toast(t(cur.drawMode === 'h' ? 'draw.hintH' : 'draw.hint2'));
    }));
    el.querySelector('#tc-cmp-sel').addEventListener('change', (e) => {
      const x = ctx.compareList().find((y) => y.key === e.target.value);
      compareWith = x ? { forKey: keyOf(asset), key: x.key, asset: x } : null;
      applyCompare();
    });
    el.querySelectorAll('[data-ind]').forEach((b) => b.addEventListener('click', () => {
      const on = new Set(ctx.getInd());
      if (on.has(b.dataset.ind)) on.delete(b.dataset.ind); else on.add(b.dataset.ind);
      ctx.setInd([...on]);
      b.setAttribute('aria-pressed', String(on.has(b.dataset.ind)));
      buildIndicators();
    }));

    const box = el.querySelector('#tc-chart');
    let LWC, data;
    try { LWC = await loadLib(); } catch {
      if (my === token) box.innerHTML = `<div class="msg">${t('tc.noData')}</div>`;
      return;
    }
    try { data = await ctx.fetchCandles(asset, tf); } catch { data = null; }
    if (my !== token) return;
    if (!data?.candles?.length) { box.innerHTML = `<div class="msg">${t('tc.noData')}</div>`; return; }
    box.innerHTML = '';

    const lastClose = data.candles[data.candles.length - 1][4];
    const prec = lastClose >= 1000 ? 2 : lastClose >= 10 ? 2 : lastClose >= 1 ? 3 : lastClose >= 0.01 ? 5 : 8;
    const th = themeOpts();
    const chart = LWC.createChart(box, {
      autoSize: true,
      layout: { ...th.layout, fontFamily: getComputedStyle(document.body).fontFamily, attributionLogo: true },
      grid: th.grid,
      rightPriceScale: th.rightPriceScale,
      timeScale: { ...th.timeScale, timeVisible: tf !== '1d', secondsVisible: false, rightOffset: 6 },
      crosshair: { mode: LWC.CrosshairMode.Normal },
      localization: { locale: ctx.locale(), priceFormatter: (p) => ctx.num(p, prec) },
    });
    const series = chart.addSeries(LWC.CandlestickSeries, {
      upColor: C.up, downColor: C.down, borderVisible: false, wickUpColor: C.up, wickDownColor: C.down,
      priceFormat: { type: 'price', precision: prec, minMove: 10 ** -prec },
    });
    const bars = data.candles.map(([ts, o, h, l, c, v]) => ({ time: local(ts), open: o, high: h, low: l, close: c, volume: v ?? null }));
    series.setData(bars);
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - 90), to: bars.length + 5 });
    Object.assign(cur, { chart, series, LWC, bars, prec, ind: {} });
    buildIndicators();
    applyCompare();
    renderDrawings();
    el.querySelector('#tc-src').textContent = t('tc.src', { s: data.source });
    applyLive();
    drawLines();
    interactions(box);
  }

  /** Dernière bougie ajustée au cours actuel (si frais), pour un graphique vivant entre deux chargements. */
  function applyLive() {
    if (!cur?.series) return;
    const q = ctx.quote(cur.asset);
    const last = cur.bars[cur.bars.length - 1];
    if (!q.ok || !isNum(q.price) || !last) return;
    const nowLocal = local(Math.floor(Date.now() / 1000));
    if (nowLocal - last.time >= TF_SEC[cur.tf]) return; // la bougie en cours arrivera avec le prochain chargement
    const bar = { ...last, close: q.price, high: Math.max(last.high, q.price), low: Math.min(last.low, q.price) };
    cur.bars[cur.bars.length - 1] = bar;
    cur.series.update(bar);
  }

  async function onData() {
    if (!cur?.series) return;
    const my = token;
    try {
      const data = await ctx.fetchCandles(cur.asset, cur.tf);
      if (my !== token || !cur?.series || !data?.candles?.length) return;
      const lastT = cur.bars[cur.bars.length - 1]?.time ?? 0;
      for (const [ts, o, h, l, c, v] of data.candles) {
        const bar = { time: local(ts), open: o, high: h, low: l, close: c, volume: v ?? null };
        if (bar.time < lastT) continue;
        if (bar.time === lastT) cur.bars[cur.bars.length - 1] = bar; else cur.bars.push(bar);
        cur.series.update(bar);
      }
    } catch { /* on garde l'affichage actuel */ }
    applyLive();
    updateIndicators();
    drawLines();
  }

  /** (Re)crée les séries d'indicateurs choisis : moyennes et volumes sur le graphique, RSI et MACD dans des panneaux dessous. */
  function buildIndicators() {
    if (!cur?.chart) return;
    const { chart, LWC } = cur;
    for (const s of Object.values(cur.ind)) { try { chart.removeSeries(s); } catch { /* déjà retirée */ } }
    cur.ind = {};
    const on = new Set(ctx.getInd());
    const line = (color, pane = 0, extra = {}) => chart.addSeries(LWC.LineSeries, { color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...extra }, pane);
    if (on.has('ma20')) cur.ind.ma20 = line(IC.ma20);
    if (on.has('ma50')) cur.ind.ma50 = line(IC.ma50);
    if (on.has('vol') && cur.bars.some((b) => b.volume != null)) {
      cur.ind.vol = chart.addSeries(LWC.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', priceLineVisible: false, lastValueVisible: false }, 0);
      chart.priceScale('vol', 0).applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    }
    let pane = 1;
    if (on.has('rsi')) {
      cur.ind.rsi = line(IC.rsi, pane, { lastValueVisible: true, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
      cur.ind.rsi.createPriceLine({ price: 70, color: 'rgba(240,82,82,.6)', lineStyle: LWC.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' });
      cur.ind.rsi.createPriceLine({ price: 30, color: 'rgba(34,197,94,.6)', lineStyle: LWC.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: '' });
      pane++;
    }
    if (on.has('macd')) {
      const pf = { type: 'price', precision: cur.prec, minMove: 10 ** -cur.prec };
      cur.ind.hist = chart.addSeries(LWC.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: pf }, pane);
      cur.ind.macd = line(IC.macd, pane, { priceFormat: pf });
      cur.ind.signal = line(IC.signal, pane, { priceFormat: pf });
    }
    try { chart.panes().forEach((p, i) => { if (i > 0) p.setHeight(80); }); } catch { /* ancienne version */ }
    updateIndicators();
    applyEvents(on.has('ev'));
  }

  /* ---------- Repères : détachements de dividende (D) et publications de résultats (R), actions seulement ---------- */
  const eventsCache = new Map(); // symbole → { at, d }
  async function applyEvents(show) {
    if (!cur?.series) return;
    const c = cur;
    if (!show || c.asset.kind !== 's' || !ctx.fetchEvents) { c.markers?.setMarkers([]); return; }
    const sym = c.asset.assetId;
    let hit = eventsCache.get(sym);
    if (!hit || Date.now() - hit.at > 6 * 3600_000) {
      let d = null;
      try { d = await ctx.fetchEvents(sym); } catch { /* aucun repère */ }
      hit = { at: Date.now(), d };
      eventsCache.set(sym, hit);
    }
    if (cur !== c || !hit.d) return;
    const times = c.bars.map((b) => b.time);
    // Bougie qui contient l'événement : la dernière dont l'ouverture est antérieure ou égale à sa date.
    const snap = (ms) => {
      const tl = local(Math.floor(ms / 1000));
      if (!times.length || tl < times[0] || tl > times[times.length - 1] + TF_SEC[c.tf]) return null;
      let lo = 0, hi = times.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid] <= tl) lo = mid; else hi = mid - 1; }
      return times[lo];
    };
    const marks = [];
    for (const x of hit.d.dividends || []) { const tm = snap(x.time); if (tm != null) marks.push({ time: tm, position: 'belowBar', color: '#22c55e', shape: 'circle', text: t('tc.evDiv'), size: 1 }); }
    for (const x of hit.d.earnings || []) { const tm = snap(x.time); if (tm != null) marks.push({ time: tm, position: 'aboveBar', color: '#b48cff', shape: 'square', text: t('tc.evEarn'), size: 1 }); }
    marks.sort((a, b) => a.time - b.time);
    try {
      if (!c.markers) c.markers = c.LWC.createSeriesMarkers(c.series, marks);
      else c.markers.setMarkers(marks);
    } catch { /* version sans marqueurs */ }
  }
  function updateIndicators() {
    if (!cur?.chart) return;
    const { ind, bars } = cur;
    if (ind.ma20) ind.ma20.setData(sma(bars, 20));
    if (ind.ma50) ind.ma50.setData(sma(bars, 50));
    if (ind.vol) ind.vol.setData(bars.filter((b) => b.volume != null).map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(34,197,94,.35)' : 'rgba(240,82,82,.35)' })));
    if (ind.rsi) ind.rsi.setData(rsi(bars));
    if (ind.macd) { const m = macd(bars); ind.macd.setData(m.line); ind.signal.setData(m.signal); ind.hist.setData(m.hist); }
  }

  /* ---------- Lignes : entrée, TP, SL, liquidation, ordres ---------- */
  function drawLines() {
    if (!cur?.series) return;
    const { series, LWC } = cur;
    for (const l of cur.lines) series.removePriceLine(l.line);
    cur.lines = [];
    const add = (price, color, style, width, title, meta = {}) => {
      if (!isNum(price) || price <= 0) return;
      const line = series.createPriceLine({ price, color, lineStyle: style, lineWidth: width, axisLabelVisible: true, title });
      cur.lines.push({ line, price, ...meta });
    };
    const { positions, orders } = ctx.paper.forAsset(cur.asset);
    const q = ctx.quote(cur.asset);
    const S = LWC.LineStyle;
    for (const p of positions) {
      const d = p.side === 'long' ? 1 : -1;
      const fx = ctx.paper.fxOf(p, q);
      const pnlAt = (px) => Math.max(-p.margin, (px - p.entry) * p.qty * d * fx); // en dollars
      add(p.entry, lines().entry, S.Solid, 2, `${p.side === 'long' ? 'LONG' : 'SHORT'} ${p.lev}× ${isNum(q.price) ? ctx.signed(pnlAt(q.price)) : ''}`, { type: 'entry', id: p.id });
      if (p.tp != null) add(p.tp, C.up, S.Dashed, 2, `TP ${ctx.signed(pnlAt(p.tp))}`, { type: 'tp', id: p.id });
      if (p.sl != null) add(p.sl, C.down, S.Dashed, 2, `SL ${ctx.signed(pnlAt(p.sl))}`, { type: 'sl', id: p.id });
      const liq = ctx.paper.liqOf(p, fx);
      if (liq != null) add(liq, lines().liq, S.Dotted, 1, t('pt.liqShort'), { type: 'liq', id: p.id });
    }
    for (const o of orders) {
      add(o.price, lines().order, S.LargeDashed, 1, `${t(o.side === 'long' ? 'pt.long' : 'pt.short')} ${t(`pt.${o.type}`).toLowerCase()} ${ctx.qty(o.qty)}`, { type: 'order', id: o.id });
    }
    if (cur.tap != null) add(cur.tap, lines().tap, S.SparseDotted, 1, '', { type: 'tap' });
  }

  /* ---------- Interactions : glisser TP / SL, toucher pour agir à un prix ---------- */
  function interactions(box) {
    const { chart, series } = cur;
    let drag = null, moved = false;
    const yOf = (e) => e.clientY - box.getBoundingClientRect().top;
    const nearest = (y, tol) => {
      let best = null;
      for (const l of cur.lines) {
        if (l.type !== 'tp' && l.type !== 'sl') continue;
        const ly = series.priceToCoordinate(l.price);
        if (ly == null) continue;
        const dist = Math.abs(ly - y);
        if (dist <= tol && (!best || dist < best.dist)) best = { l, dist };
      }
      return best?.l || null;
    };
    box.addEventListener('pointerdown', (e) => {
      const l = nearest(yOf(e), e.pointerType === 'touch' ? 20 : 9);
      if (!l) return;
      drag = l;
      moved = false;
      chart.applyOptions({ handleScroll: false, handleScale: false });
      try { box.setPointerCapture(e.pointerId); } catch { /* rien */ }
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
    box.addEventListener('pointermove', (e) => {
      if (!drag) {
        if (e.pointerType === 'mouse') box.style.cursor = nearest(yOf(e), 9) ? 'ns-resize' : '';
        return;
      }
      const p = series.coordinateToPrice(yOf(e));
      if (!isNum(p) || p <= 0) return;
      moved = true;
      drag.price = p;
      drag.line.applyOptions({ price: p, title: `${drag.type.toUpperCase()} ${ctx.num(p, cur.prec)}` });
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
    const end = () => {
      if (!drag) return;
      const d = drag;
      drag = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      if (!moved) return;
      suppressClick = Date.now();
      const err = ctx.paper.setLevel(d.id, d.type, d.price);
      if (err) ctx.toast(err, 'neg');
      drawLines();
    };
    box.addEventListener('pointerup', end, { capture: true });
    box.addEventListener('pointercancel', end, { capture: true });
    chart.subscribeClick((param) => {
      if (Date.now() - suppressClick < 500 || !param.point) return;
      const price = series.coordinateToPrice(param.point.y);
      if (cur.drawMode) return; // en mode tracé, les touchers sont gérés plus bas (pointerdown / pointerup)
      if (isNum(price) && price > 0) showPop(price);
    });
    // Mode tracé : chaque toucher (sans glissement) pose un point. Géré ici plutôt que par subscribeClick,
    // car deux touchers rapprochés y comptent pour un double toucher et le second serait perdu.
    let tapStart = null;
    box.addEventListener('pointerdown', (e) => { if (cur?.drawMode) tapStart = { x: e.clientX, y: e.clientY, at: Date.now() }; }, { capture: true });
    box.addEventListener('pointerup', (e) => {
      const st = tapStart; tapStart = null;
      if (!cur?.drawMode || !st || Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8 || Date.now() - st.at > 800) return;
      const r = box.getBoundingClientRect();
      const z = r.width / box.offsetWidth || 1; // zoom de l'interface (taille du texte)
      const point = { x: (e.clientX - r.left) / z, y: (e.clientY - r.top) / z };
      suppressClick = Date.now(); // ce toucher sert au tracé : pas de menu d'ordre
      drawAt({ point, time: null }, series.coordinateToPrice(point.y));
    }, { capture: true });
  }

  /* Tracés de l'utilisateur (par actif, mémorisés sur l'appareil) : ligne horizontale, tendance (2 points), Fibonacci (2 points). */
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  function setDrawButtons() {
    cur?.el.querySelectorAll('[data-draw]').forEach((b) => b.setAttribute('aria-pressed', String(cur.drawMode === b.dataset.draw)));
  }
  /** Date d'un point du graphique, y compris à droite de la dernière bougie (prolongement au pas de l'unité de temps). */
  function timeFromX(x) {
    const ts = cur.chart.timeScale();
    const direct = ts.coordinateToTime(x);
    if (direct != null) return direct;
    const logical = ts.coordinateToLogical(x);
    const bars = cur.bars;
    if (logical == null || !bars.length) return null;
    const i = Math.round(logical);
    if (i < 0) return bars[0].time;
    if (i < bars.length) return bars[i].time;
    return bars[bars.length - 1].time + (i - (bars.length - 1)) * TF_SEC[cur.tf];
  }
  function drawAt(param, price) {
    if (!isNum(price) || price <= 0) return;
    const time = param.time ?? timeFromX(param.point.x);
    const key = keyOf(cur.asset);
    const list = ctx.getDraw(key);
    if (cur.drawMode === 'h') list.push({ type: 'h', price });
    else if (!cur.drawP1) { if (time == null) return; cur.drawP1 = { time, price }; ctx.toast(t('draw.hintNext')); return; }
    else {
      if (time == null || time === cur.drawP1.time) return;
      list.push({ type: cur.drawMode, p1: cur.drawP1, p2: { time, price } });
    }
    ctx.setDraw(key, list.slice(-20));
    cur.drawMode = null; cur.drawP1 = null;
    setDrawButtons();
    renderDrawings();
  }
  function renderDrawings() {
    if (!cur?.chart) return;
    const { chart, series, LWC } = cur;
    for (const x of cur.drawObjs || []) { try { if (x.line) series.removePriceLine(x.line); else chart.removeSeries(x.series); } catch { /* déjà retiré */ } }
    cur.drawObjs = [];
    const color = '#b48cff', S = LWC.LineStyle;
    for (const d of ctx.getDraw(keyOf(cur.asset))) {
      if (d.type === 'h' && isNum(d.price)) {
        cur.drawObjs.push({ line: series.createPriceLine({ price: d.price, color, lineStyle: S.Dashed, lineWidth: 1, axisLabelVisible: true, title: '' }) });
      } else if (d.type === 't' && d.p1 && d.p2) {
        const pts = [d.p1, d.p2].sort((a, b) => a.time - b.time).map((p) => ({ time: p.time, value: p.price }));
        const ls = chart.addSeries(LWC.LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        ls.setData(pts);
        cur.drawObjs.push({ series: ls });
      } else if (d.type === 'f' && d.p1 && d.p2) {
        const hi = Math.max(d.p1.price, d.p2.price), lo = Math.min(d.p1.price, d.p2.price);
        for (const r of FIB) {
          const price = hi - (hi - lo) * r;
          cur.drawObjs.push({ line: series.createPriceLine({ price, color, lineStyle: r === 0 || r === 1 ? S.Solid : S.Dotted, lineWidth: 1, axisLabelVisible: false, title: `Fib ${ctx.num(r * 100, 1)} %` }) });
        }
      }
    }
  }

  function hidePop() {
    if (!cur) return;
    cur.el.querySelector('#tc-pop').hidden = true;
    cur.tap = null;
    drawLines();
  }

  function showPop(price) {
    const pop = cur.el.querySelector('#tc-pop');
    const asset = cur.asset;
    const ref = ctx.quote(asset).price;
    const buyType = isNum(ref) && price < ref ? 'limit' : 'stop';
    const sellType = isNum(ref) && price > ref ? 'limit' : 'stop';
    const pos = ctx.paper.forAsset(asset).positions.at(-1);
    cur.tap = price;
    drawLines();
    pop.innerHTML = `<div class="tc-pop-h"><strong>${ctx.price(price, asset.kind, ctx.quote(asset).ccy)}</strong><button type="button" class="tc-x" data-a="x" aria-label="${esc(t('snap.close'))}">✕</button></div>
      <div class="tc-pop-b">
        <button type="button" class="btn btn-sm btn-buy" data-a="buy">${t('tc.buyAt', { type: t(`pt.${buyType}`).toLowerCase() })}</button>
        <button type="button" class="btn btn-sm btn-sell" data-a="sell">${t('tc.sellAt', { type: t(`pt.${sellType}`).toLowerCase() })}</button>
        ${pos ? `<button type="button" class="btn btn-sm" data-a="tp">${t('tc.tpHere')}</button><button type="button" class="btn btn-sm" data-a="sl">${t('tc.slHere')}</button>` : ''}
        <button type="button" class="btn btn-sm" data-a="alert">${t('tc.alertHere')}</button>
      </div>`;
    pop.hidden = false;
    pop.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'buy') ctx.openTicket(asset, { side: 'long', type: buyType, price });
      else if (a === 'sell') ctx.openTicket(asset, { side: 'short', type: sellType, price });
      else if (a === 'tp' || a === 'sl') {
        const err = ctx.paper.setLevel(pos.id, a, price);
        if (err) { ctx.toast(err, 'neg'); return; }
      } else if (a === 'alert') ctx.openAlert(price);
      hidePop();
    }));
  }

  return {
    mount,
    unmount,
    onData,
    theme: () => { if (cur?.chart) { cur.chart.applyOptions(themeOpts()); drawLines(); } },
    refresh: () => { applyLive(); drawLines(); },
  };
}
