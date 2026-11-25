// Catégorie « Bot » : terminal de suivi du bot de paper trading (simulation, argent fictif).
// État publié par le bot toutes les 15 s environ (/api/bot) : comptes FTMO et Lucid simulés, positions ouvertes avec
// entrée / SL / TP, trades clôturés. Graphique : le vrai graphique TradingView (widget, après consentement) par défaut ;
// vue « Trades du bot » : TradingView Lightweight Charts™ (servie par le site), bougies Yahoo (/api/candles), lignes
// d'entrée, de stop et d'objectif de chaque position, repères des trades clôturés.
// Mise en page « terminal » : bandeau d'état, liste des marchés, graphique, comptes, blotter à onglets.

const LIB = '/vendor/lightweight-charts/lightweight-charts.standalone.production.js';
const TFS = ['5m', '15m', '1h', '1d'];
const TF_SEC = { '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };
const TV_TF = { '5m': '5', '15m': '15', '1h': '60', '1d': 'D' };
const SRC_KEY = 'marches:botChart';
const readSrc = () => { try { return localStorage.getItem(SRC_KEY) === 'bot' ? 'bot' : 'tv'; } catch { return 'tv'; } };
const TV = { gold: 'COMEX:GC1!', nas100: 'NASDAQ:NDX', spx: 'SP:SPX', eurusd: 'FX:EURUSD', silver: 'COMEX:SI1!', dow: 'DJ:DJI', russell: 'TVC:RUT',
  tlt: 'NASDAQ:TLT', googl: 'NASDAQ:GOOGL', pltr: 'NASDAQ:PLTR', lly: 'NYSE:LLY', ba: 'NYSE:BA' };
// Symboles intégrables dans le widget (les indices et futures n'y sont pas disponibles : CFD équivalents, comme sur FTMO)
const TV_EMBED = { ...TV, gold: 'OANDA:XAUUSD', nas100: 'CAPITALCOM:US100', spx: 'CAPITALCOM:US500', silver: 'OANDA:XAGUSD', dow: 'CAPITALCOM:US30', russell: 'CAPITALCOM:RTY' };
// Code court affiché à la place d'un émoji (contrat équivalent)
const CODE = { gold: 'XAU', nas100: 'NDX', spx: 'SPX', eurusd: 'EURUSD', silver: 'XAG', dow: 'DJI', russell: 'RUT' };
const LIVE_MS = 15_000;
const CANDLE_MS = 30_000;
const PAGE = 40;
const local = (sec) => sec - new Date(sec * 1000).getTimezoneOffset() * 60;

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
const cssVar = (el, n, d) => (el && getComputedStyle(el).getPropertyValue(n).trim()) || d;

export function createBot(ctx) {
  const { t, esc, isNum, ND } = ctx;
  const st = { d: null, at: 0, err: false, loading: false, market: null, tf: '15m', timer: null, chart: null, el: null, tab: 'pos', shown: PAGE, focus: null, curves: {}, src: readSrc() };
  const cls = (v) => (!isNum(v) || Math.abs(v) < 0.5 ? '' : v > 0 ? 'up' : 'dn');
  const money = (v) => (isNum(v) ? ctx.money(v) : ND);
  const signed = (v) => (isNum(v) ? ctx.signed(v) : ND);
  const px = (v) => (isNum(v) ? (Math.abs(v) < 10 ? v.toFixed(5) : v.toLocaleString(ctx.locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })) : ND);
  const mkName = (id) => st.d?.markets?.find((m) => m.id === id)?.name || id;
  const code = (id) => CODE[id] || String(id).toUpperCase();
  const side = (s) => `<span class="tm-dir ${s === 'long' ? 'up' : 'dn'}">${esc(t(s === 'long' ? 'bot.buy' : 'bot.sell'))}</span>`;
  const firm = (a) => `<span class="tm-firm tm-firm-${esc(a.id)}">${esc(a.firm)}</span>`;
  const hhmm = (sec) => `${esc(ctx.day(sec * 1000))} ${esc(ctx.time(sec * 1000))}`;

  async function load(after) {
    if (st.loading) return;
    st.loading = true;
    try {
      const r = await ctx.getJSON('/api/bot');
      if (r.body.error) throw new Error(r.body.error);
      st.d = r.body.data || null;
      st.err = false;
    } catch { st.err = true; }
    st.at = Date.now();
    st.loading = false;
    after?.();
  }

  const positionsOn = (market) => (st.d?.accounts || []).flatMap((a) => a.open.filter((p) => p.market === market).map((p) => ({ ...p, acct: a.firm })));
  const allOpen = () => (st.d?.accounts || []).flatMap((a) => a.open.map((p) => ({ a, p })));

  /* ---------- Bandeau d'état ---------- */
  function statusHTML() {
    const at = st.d?.at;
    const age = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null;
    const live = age !== null && age < 180;
    const pnl = (st.d?.accounts || []).reduce((s, a) => s + (a.unrealized || 0), 0);
    return `<div class="tm-stat">
      <span class="tm-dot ${live ? 'on' : 'off'}"></span><b>${live ? t('bot.tmLive') : t('bot.tmOff')}</b>
      <span class="tm-k">${t('bot.tmUpd')}</span><span class="tm-v">${at ? esc(ctx.time(at)) : ND}</span>
      <span class="tm-k">${t('bot.tmAge')}</span><span class="tm-v">${age === null ? ND : `${age} s`}</span>
      <span class="tm-k">${t('bot.tmOpen')}</span><span class="tm-v">${allOpen().length}</span>
      <span class="tm-k">${t('bot.tmUnreal')}</span><span class="tm-v ${cls(pnl)}">${signed(pnl)}</span>
      ${st.d?.version ? `<span class="tm-k">${t('bot.tmVer')}</span><span class="tm-v">${esc(String(st.d.version).slice(0, 7))}</span>` : ''}
      <span class="tm-sp"></span><span class="tm-sim">${t('bot.tmSim')}</span>
    </div>`;
  }

  /* ---------- Liste des marchés ---------- */
  function watchHTML() {
    const ms = st.d?.markets || [];
    const rows = ms.map((m) => {
      const pos = positionsOn(m.id);
      const pnl = pos.reduce((s, p) => s + (p.pnl || 0), 0);
      const dir = pos.length ? (pos.every((p) => p.side === 'long') ? 'up' : pos.every((p) => p.side === 'short') ? 'dn' : '') : '';
      return `<button type="button" class="tm-w${m.id === st.market ? ' on' : ''}" data-bmk="${esc(m.id)}" aria-pressed="${m.id === st.market}">
        <span class="tm-w-c">${esc(code(m.id))}</span><span class="tm-w-p">${px(m.price)}</span>
        <span class="tm-w-n">${esc(m.name)}</span><span class="tm-w-x ${dir}">${pos.length ? `${pos.length} POS <i class="${cls(pnl)}">${signed(pnl)}</i>` : '—'}</span>
      </button>`;
    }).join('');
    return `<div class="tm-ph"><span>${t('bot.tmWatch')}</span><span>${ms.length}</span></div><div class="tm-wl" role="group" aria-label="${t('bot.market')}">${rows}</div>`;
  }

  /* ---------- Comptes ---------- */
  function bar(frac, tone) {
    const w = Math.max(0, Math.min(1, isNum(frac) ? frac : 0)) * 100;
    return `<span class="tm-bar"><i class="${tone}" style="width:${w.toFixed(1)}%"></i></span>`;
  }
  function accountHTML(a) {
    const ret = ((a.equity / a.capital) - 1) * 100;
    const danger = (u) => (u > 0.6 ? 'dn' : u > 0.3 ? 'wn' : 'up');
    const phase = a.phase === 'funded' ? t('bot.funded') : `${esc(a.program)} · ${t('bot.attempt', { n: a.attempt })}`;
    const row = (k, v, extra = '') => `<div class="tm-kv"><span>${k}</span><b>${v}</b>${extra}</div>`;
    return `<section class="tm-acct">
      <div class="tm-ph">${firm(a)}<span class="tm-ph-t">${esc(a.label)}</span><span class="tm-ph-m">${phase}</span></div>
      <div class="tm-eq"><b>${money(a.equity)}</b><span class="${cls(ret * 100)}">${ctx.pct(ret)}</span></div>
      <div class="tm-kvs">
        ${row(t('bot.tmBal'), money(a.balance))}
        ${row(t('bot.tmUnreal'), `<span class="${cls(a.unrealized)}">${signed(a.unrealized)}</span>`, `<em>${a.open.length} pos</em>`)}
        ${row(t('bot.tmReal'), `<span class="${cls(a.realized)}">${signed(a.realized)}</span>`)}
        ${isNum(a.target)
    ? row(t('bot.tmTarget', { p: a.targetPct }), money(a.target), `<em>${Math.round(Math.min(1, Math.max(0, a.progress || 0)) * 100)} %</em>${bar(a.progress, 'up')}`)
    : row(t('bot.funded'), `${a.split} %`)}
        ${isNum(a.dailyLimitPct)
    ? row(t('bot.tmDay', { p: a.dailyLimitPct }), money(a.dailyFloor), `<em>${Math.round((a.dailyUsed || 0) * 100)} %</em>${bar(a.dailyUsed, danger(a.dailyUsed))}`)
    : row(t('bot.tmDayNone'), '—')}
        ${row(t(a.trailing ? 'bot.tmMaxT' : 'bot.tmMax', { v: money(a.maxLoss) }), money(a.maxFloor), `<em>${Math.round((a.maxUsed || 0) * 100)} %</em>${bar(a.maxUsed, danger(a.maxUsed))}`)}
        ${row(t('bot.tmDays'), `${a.days} / ${a.minDays}`, a.bestDayPct ? `<em>${t('bot.tmBest', { p: a.bestDayPct })}</em>` : '')}
      </div>
      <div class="tm-curve" data-curve="${esc(a.id)}"></div>
    </section>`;
  }

  /** Portefeuille perso simulé (50 % monde, 10 % or, 40 % bot) : valeur en €, répartition, poches du bot. */
  function portfolioHTML(p) {
    const eur = (v) => `${Math.round(v).toLocaleString(ctx.locale())} €`;
    const sp = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)} %`;
    const w = p.weights || {};
    const row = (k, v, extra = '') => `<div class="tm-kv"><span>${k}</span><b>${v}</b>${extra}</div>`;
    const alloc = [['WORLD', t('bot.ppWorld')], ['GLD', t('bot.ppGold')], ['BOT', t('bot.ppBot')]]
      .map(([k, name]) => row(name, `${Math.round((w[k] || 0) * 100)} %`, `<em>${t('bot.ppTarget', { p: Math.round((p.target?.[k] || 0) * 100) })}</em>`)).join('');
    return `<section class="tm-acct">
      <div class="tm-ph"><span class="tm-firm tm-firm-perso">PERSO</span><span class="tm-ph-t">${t('bot.ppTitle')}</span><span class="tm-ph-m">${t('bot.ppSince', { d: ctx.day(p.startT * 1000) })}</span></div>
      <div class="tm-eq"><b>${eur(p.value)}</b><span class="${cls(p.ret * 1000)}">${sp(p.ret)}</span></div>
      <div class="tm-kvs">
        ${row(t('bot.ppDd'), `<span class="${cls(p.drawdown * 1000)}">${sp(p.drawdown)}</span>`, `<em>${t('bot.ppMaxDd', { v: sp(p.maxDrawdown) })}</em>`)}
        ${alloc}
        ${(p.sleeves || []).map((s) => row(esc(s.name), `<span class="${s.open ? 'up' : ''}">${s.open ? esc(s.sym) : t('bot.ppCash')}</span>`)).join('')}
      </div>
      <div class="tm-curve" data-curve="perso"></div>
    </section>`;
  }

  /** Courbe de la valeur du compte (trades clôturés, puis valeur actuelle). */
  async function drawCurves(root) {
    const LWC = await loadLib().catch(() => null);
    if (!LWC || !st.d) return;
    const pf = st.d.portfolio;
    const pbox = root.querySelector('[data-curve="perso"]');
    if (pf && pbox && pf.curve?.length > 1) {
      st.curves.perso?.remove?.();
      pbox.innerHTML = '';
      const ch = LWC.createChart(pbox, { height: 64, autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssVar(st.el, '--tm-mut', '#6b7785'), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 2 } });
      const s = ch.addSeries(LWC.LineSeries, { color: pf.value >= pf.capital ? cssVar(st.el, '--tm-up', '#2ebd85') : cssVar(st.el, '--tm-dn', '#f6465d'), lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(pf.curve.map(([time, value]) => ({ time, value })));
      s.createPriceLine({ price: pf.capital, color: cssVar(st.el, '--tm-mut', '#6b7785'), lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: '' });
      ch.timeScale().fitContent();
      st.curves.perso = ch;
    }
    for (const a of st.d.accounts) {
      const box = root.querySelector(`[data-curve="${a.id}"]`);
      if (!box) continue;
      st.curves[a.id]?.remove?.();
      box.innerHTML = '';
      const pts = [];
      let v = a.balance - a.closed.reduce((s, x) => s + (x.pnl || 0), 0);
      const t0 = a.closed[0]?.entryT || Math.floor(Date.now() / 1000) - 86400;
      pts.push({ time: local(t0), value: v });
      for (const x of [...a.closed].sort((p, q) => p.exitT - q.exitT)) { v += x.pnl || 0; pts.push({ time: local(x.exitT), value: v }); }
      pts.push({ time: local(Math.floor((st.d.at || Date.now()) / 1000)), value: a.equity });
      const uniq = []; for (const p of pts) { if (uniq.length && p.time <= uniq[uniq.length - 1].time) p.time = uniq[uniq.length - 1].time + 1; uniq.push(p); }
      const up = a.equity >= a.capital;
      const ch = LWC.createChart(box, { height: 64, autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssVar(st.el, '--tm-mut', '#6b7785'), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 2 } });
      const s = ch.addSeries(LWC.LineSeries, { color: up ? cssVar(st.el, '--tm-up', '#2ebd85') : cssVar(st.el, '--tm-dn', '#f6465d'), lineWidth: 1, lineType: 1, priceLineVisible: false, lastValueVisible: false });
      s.setData(uniq);
      s.createPriceLine({ price: a.capital, color: cssVar(st.el, '--tm-mut', '#6b7785'), lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: '' });
      ch.timeScale().fitContent();
      st.curves[a.id] = ch;
    }
  }

  /* ---------- Graphique ---------- */
  function chartBarHTML() {
    const m = st.d?.markets?.find((x) => x.id === st.market);
    const pos = positionsOn(st.market);
    return `<div class="tm-cb">
      <b class="tm-cb-s">${esc(code(st.market))}</b><span class="tm-cb-n">${esc(m?.name || '')}</span><span class="tm-cb-p">${px(m?.price)}</span>
      ${pos.length ? `<span class="tm-cb-pos">${pos.map((p) => `${esc(p.acct)} ${side(p.side)} @ ${px(p.entry)}`).join(' · ')}</span>` : ''}
      <span class="tm-sp"></span>
      <span class="tm-tfs" role="group" aria-label="${t('bot.src')}">${[['tv', t('bot.srcTV')], ['bot', t('bot.srcBot')]].map(([v, l]) => `<button type="button" data-bsrc="${v}" aria-pressed="${srcOf() === v}">${esc(l)}</button>`).join('')}</span>
      <span class="tm-tfs" role="group" aria-label="${t('bot.tf')}">${TFS.map((x) => `<button type="button" data-btf="${x}" aria-pressed="${x === st.tf}">${x}</button>`).join('')}</span>
      <a class="tm-tv" href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(TV[st.market] || '')}" target="_blank" rel="noopener" title="${esc(t('bot.openTV', { m: m?.name || '' }))}">TV ↗</a>
    </div>`;
  }
  const srcOf = () => (st.src === 'tv' && TV_EMBED[st.market] && ctx.tv ? 'tv' : 'bot');
  async function drawChart() {
    const box = st.el?.querySelector('#bot-chart');
    if (!box || !st.d) return;
    const legend = st.el.querySelector('#bot-legend');
    if (legend) legend.textContent = srcOf() === 'tv' ? t('bot.tvLegend') : t('bot.legend');
    if (srcOf() === 'tv') {
      // Vrai graphique TradingView : rechargé seulement si le marché, l'unité de temps ou le consentement changent
      const m = st.d.markets.find((x) => x.id === st.market) || st.d.markets[0];
      const key = `tv:${m?.id}:${st.tf}`;
      if (box.dataset.k === key && box.firstElementChild) return;
      st.chart?.chart?.remove(); st.chart = null;
      box.dataset.k = key;
      box.classList.add('tm-chart-tv');
      ctx.tv(box, TV_EMBED[m.id], TV_TF[st.tf], m.name || m.id);
      return;
    }
    if (box.dataset.k) { delete box.dataset.k; box.classList.remove('tm-chart-tv'); box.innerHTML = ''; }
    const LWC = await loadLib().catch(() => null);
    if (srcOf() === 'tv') return;
    if (!LWC) { box.innerHTML = `<p class="tm-empty">${t('bot.chartNa')}</p>`; return; }
    const m = st.d.markets.find((x) => x.id === st.market) || st.d.markets[0];
    if (!m) return;
    let data = null;
    try { data = (await ctx.getJSON(`/api/candles?kind=i&symbol=${encodeURIComponent(m.symbol)}&tf=${st.tf}`)).body; } catch { /* n/d */ }
    if (!box.isConnected || srcOf() === 'tv') return; // entre-temps : retour au graphique TradingView
    if (!data?.candles?.length) { box.innerHTML = `<p class="tm-empty">${t('bot.chartNa')}</p>`; st.chart?.chart?.remove(); st.chart = null; return; }
    const key = `${m.id}:${st.tf}`;
    const UP = cssVar(st.el, '--tm-up', '#2ebd85');
    const DN = cssVar(st.el, '--tm-dn', '#f6465d');
    if (!st.chart || st.chart.key !== key || !box.contains(st.chart.host)) {
      st.chart?.chart?.remove();
      box.innerHTML = '';
      const host = document.createElement('div');
      host.className = 'tm-chart-host';
      box.append(host);
      const line = cssVar(st.el, '--tm-grid', '#161c23');
      const chart = LWC.createChart(host, { autoSize: true,
        layout: { background: { type: 'solid', color: cssVar(st.el, '--tm-bg1', '#0d1116') }, textColor: cssVar(st.el, '--tm-mut', '#6b7785'), fontSize: 11,
          fontFamily: cssVar(st.el, '--tm-mono', 'ui-monospace, Menlo, Consolas, monospace'), attributionLogo: false },
        grid: { vertLines: { color: line }, horzLines: { color: line } },
        rightPriceScale: { borderColor: cssVar(st.el, '--tm-line', '#1c232b') },
        crosshair: { mode: 0, vertLine: { color: '#5d6875', labelBackgroundColor: '#2a313a' }, horzLine: { color: '#5d6875', labelBackgroundColor: '#2a313a' } },
        timeScale: { borderColor: cssVar(st.el, '--tm-line', '#1c232b'), timeVisible: st.tf !== '1d', secondsVisible: false } });
      const series = chart.addSeries(LWC.CandlestickSeries, { upColor: UP, downColor: DN, borderVisible: false, wickUpColor: UP, wickDownColor: DN,
        priceFormat: { type: 'price', precision: m.id === 'eurusd' ? 5 : 2, minMove: m.id === 'eurusd' ? 0.00001 : 0.01 } });
      st.chart = { key, host, chart, series, LWC, lines: [], markers: null, first: true };
    }
    const c = st.chart;
    c.series.setData(data.candles.map(([time, o, h, l, cl]) => ({ time: local(time), open: o, high: h, low: l, close: cl })));
    // Lignes des positions ouvertes : entrée (bleu), SL (rouge), TP (vert)
    for (const l of c.lines) c.series.removePriceLine(l);
    c.lines = [];
    const add = (price, color, title, style = 0) => { if (isNum(price)) c.lines.push(c.series.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title })); };
    for (const p of positionsOn(m.id)) {
      const tag = `${p.acct} ${p.sid}`;
      add(p.entry, '#4c8dff', `${tag} ${t(p.side === 'long' ? 'bot.buy' : 'bot.sell')}`);
      add(p.sl, DN, `${tag} SL`, 2);
      add(p.tp, UP, `${tag} TP`, 2);
    }
    // Repères : trades de l'historique affiché (compte choisi ou paper) sur ce marché, et positions ouvertes
    const first = data.candles[0][0];
    const sec = TF_SEC[st.tf];
    const snap = (x) => local(Math.floor(x / sec) * sec);
    const marks = [];
    const paperMode = st.tab === 'paper';
    for (const x of histRows().filter((y) => y.market === m.id && y.exitT >= first)) {
      const win = paperMode ? x.pnlPct >= 0 : x.pnl >= 0;
      if (x.entryT >= first) marks.push({ time: snap(x.entryT), position: x.side === 'long' ? 'belowBar' : 'aboveBar', color: '#4c8dff', shape: x.side === 'long' ? 'arrowUp' : 'arrowDown', text: x.sid });
      marks.push({ time: snap(x.exitT), position: 'aboveBar', color: win ? UP : DN, shape: 'square', text: paperMode ? ctx.pct(x.pnlPct) : signed(x.pnl) });
    }
    for (const p of positionsOn(m.id)) if (p.entryT >= first) marks.push({ time: snap(p.entryT), position: p.side === 'long' ? 'belowBar' : 'aboveBar', color: '#4c8dff', shape: p.side === 'long' ? 'arrowUp' : 'arrowDown', text: `${p.acct} ${p.sid}` });
    marks.sort((a, b) => a.time - b.time);
    if (c.markers) c.markers.setMarkers(marks); else c.markers = c.LWC.createSeriesMarkers(c.series, marks);
    if (st.focus) {
      const pad = sec * 30;
      c.chart.timeScale().setVisibleRange({ from: local(Math.max(first, st.focus.entryT - pad)), to: local(st.focus.exitT + pad) });
      st.focus = null; c.first = false;
    } else if (c.first) { const n = data.candles.length; c.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 6 }); c.first = false; }
  }

  /* ---------- Blotter ---------- */
  function histRows() {
    if (!st.d) return [];
    if (st.tab === 'paper') return [...(st.d.paper || [])].sort((p, q) => q.exitT - p.exitT);
    const id = st.tab === 'hist-lucid' ? 'lucid' : 'ftmo';
    const a = st.d.accounts.find((x) => x.id === id) || st.d.accounts[0];
    if (!a) return [];
    return [...a.closed.map((x) => ({ ...x, attempt: a.attempt })), ...(a.archive || [])].sort((p, q) => q.exitT - p.exitT);
  }
  function tabsHTML() {
    const refused = st.d?.accounts?.find((a) => a.refused)?.refused;
    const tabs = [['pos', `${t('bot.tmTabPos')} <i>${allOpen().length}</i>`],
      ...(st.d?.accounts || []).map((a) => [`hist-${a.id}`, `${t('bot.tmTabHist')} ${esc(a.firm)}`]),
      ['paper', t('bot.tmTabPaper')], ...(refused ? [['ai', `${t('bot.tmTabAi')} <i>${refused.n}</i>`]] : [])];
    return `<div class="tm-tabs" role="tablist">${tabs.map(([v, txt]) => `<button type="button" role="tab" data-tab2="${v}" aria-selected="${st.tab === v}">${txt}</button>`).join('')}</div>`;
  }
  function posTable() {
    const rows = allOpen();
    if (!rows.length) return `<p class="tm-empty">${t('bot.noPos')}</p>`;
    return `<table class="tm-t"><thead><tr><th>${t('bot.acct')}</th><th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th class="r">${t('bot.entry')}</th><th class="r">SL</th><th class="r">TP</th><th class="r">${t('bot.size')}</th><th class="r">${t('bot.risk')}</th><th class="r">${t('bot.tmOpened')}</th><th class="r">${t('bot.pnl')}</th></tr></thead><tbody>
      ${rows.map(({ a, p }) => `<tr data-mk="${esc(p.market)}" class="tm-click"><td>${firm(a)}</td><td><b>${esc(code(p.market))}</b></td>
        <td title="${esc(p.name || '')}">${esc(p.sid)}${isNum(p.ai) ? ` <em>IA ${p.ai}%</em>` : ''}</td><td>${side(p.side)}</td>
        <td class="r">${px(p.entry)}</td><td class="r dn">${px(p.sl)}</td><td class="r up">${isNum(p.tp) ? px(p.tp) : '—'}</td>
        <td class="r">${p.n ? `${p.n} ${esc(p.contract || '')}` : money(p.notional)}</td><td class="r">${money(p.risk)}</td><td class="r">${p.entryT ? hhmm(p.entryT) : ND}</td>
        <td class="r ${cls(p.pnl)}"><b>${signed(p.pnl)}</b></td></tr>`).join('')}</tbody></table>`;
  }
  function histTable() {
    const rows = histRows();
    if (!rows.length) return `<p class="tm-empty">${t('bot.noTrades')}</p>`;
    const paperMode = st.tab === 'paper';
    const val = (x) => (paperMode ? x.pnlPct : x.pnl);
    const wins = rows.filter((x) => val(x) > 0).length;
    const total = rows.reduce((s2, x) => s2 + (val(x) || 0), 0);
    const sum = paperMode
      ? t('bot.sumPaper', { n: rows.length, w: Math.round((wins / rows.length) * 100), v: signed(Math.round(total * 10)) })
      : t('bot.sumAcct', { n: rows.length, w: Math.round((wins / rows.length) * 100), v: signed(total) });
    const shown = rows.slice(0, st.shown);
    return `<div class="tm-sum">${sum}${paperMode ? ` · ${t('bot.paperNote')}` : ''}</div>
      <table class="tm-t"><thead><tr><th>${t('bot.tmClosed')}</th>${paperMode ? '' : `<th>${t('bot.challenge')}</th>`}<th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th class="r">${t('bot.entry')}</th><th class="r">${t('bot.tmExit')}</th><th class="r">${t('bot.result')}</th><th class="r">R</th><th>${t('bot.why')}</th></tr></thead><tbody>
      ${shown.map((x) => { const v = val(x); const wl = v > 0 ? 'tm-win' : v < 0 ? 'tm-loss' : ''; return `<tr data-mk="${esc(x.market)}" data-te="${x.entryT}" data-tx="${x.exitT}" class="tm-click ${wl}"><td>${hhmm(x.exitT)}</td>
        ${paperMode ? '' : `<td>${isNum(x.attempt) ? `#${x.attempt}` : '—'}</td>`}<td><b>${esc(code(x.market))}</b></td><td title="${esc(x.name || '')}">${esc(x.sid)}</td>
        <td><span class="tm-dir">${esc(t(x.side === 'long' ? 'bot.buy' : 'bot.sell'))}</span></td><td class="r">${px(x.entry)}</td><td class="r">${px(x.exit)}</td>
        <td class="r ${cls(paperMode ? x.pnlPct * 100 : x.pnl)}"><b>${paperMode ? ctx.pct(x.pnlPct) : signed(x.pnl)}</b></td>
        <td class="r">${!paperMode && isNum(x.risk) && x.risk > 0 ? (x.pnl / x.risk).toFixed(2) : '—'}</td><td class="tm-why">${esc(x.reason || '')}</td></tr>`; }).join('')}</tbody></table>
      ${rows.length > st.shown ? `<button type="button" class="tm-more" data-more>${t('bot.more', { n: Math.min(PAGE, rows.length - st.shown), r: rows.length - st.shown })}</button>` : ''}`;
  }
  function aiTable() {
    const r = st.d?.accounts?.find((a) => a.refused)?.refused;
    if (!r) return `<p class="tm-empty">—</p>`;
    const head = `<div class="tm-sum">${t('bot.refused', { n: r.n, c: r.closed, v: signed(r.closedPnl), w: r.wins })}${r.closed ? ` · ${r.closedPnl <= 0 ? t('bot.aiRight') : t('bot.aiWrong')}` : ''}</div>`;
    if (!r.last?.length) return head;
    return `${head}<table class="tm-t"><thead><tr><th>${t('bot.date')}</th><th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th class="r">${t('bot.entry')}</th><th class="r">${t('bot.tmProb')}</th><th class="r">${t('bot.result')}</th></tr></thead><tbody>
      ${[...r.last].reverse().map((x) => `<tr data-mk="${esc(x.market)}" class="tm-click"><td>${hhmm(x.entryT)}</td><td><b>${esc(code(x.market))}</b></td><td>${esc(x.sid)}</td><td>${side(x.side)}</td>
        <td class="r">${px(x.entry)}</td><td class="r">${x.p}%</td><td class="r ${cls(x.pnl)}">${signed(x.pnl)}${x.state === 'open' ? ' <em>*</em>' : ''}</td></tr>`).join('')}</tbody></table>`;
  }
  function blotterHTML() {
    const body = st.tab === 'pos' ? posTable() : st.tab === 'ai' ? aiTable() : histTable();
    return `${tabsHTML()}<div class="tm-scroll">${body}</div>`;
  }

  /* ---------- Rendu ---------- */
  function fill() {
    const el = st.el;
    if (!el?.isConnected) return;
    if (!st.d) {
      el.querySelector('#bot-body').innerHTML = `<p class="tm-empty">${st.err ? t('bot.na') : st.at ? t('bot.never') : t('loading')}</p>`;
      return;
    }
    if (!st.market || !st.d.markets.some((m) => m.id === st.market)) st.market = (allOpen()[0]?.p.market) || st.d.markets[0]?.id;
    const body = el.querySelector('#bot-body');
    if (!body.querySelector('#bot-chart')) {
      body.innerHTML = `<div class="tm-grid">
        <div class="tm-status" id="bot-status"></div>
        <aside class="tm-panel tm-watch" id="bot-watch"></aside>
        <section class="tm-panel tm-main"><div id="bot-cbar"></div><div id="bot-chart" class="tm-chart"></div>
          <div class="tm-legend" id="bot-legend">${t('bot.legend')}</div></section>
        <aside class="tm-side" id="bot-accts"></aside>
        <section class="tm-panel tm-blot" id="bot-blot"></section>
        <div class="tm-foot">${t('bot.disclosure')}${st.d.adapt ? ` · ${esc(String(st.d.adapt).replace(/\p{Extended_Pictographic}\uFE0F?\s*/gu, ''))}` : ''}</div>
      </div>`;
    }
    body.querySelector('#bot-status').innerHTML = statusHTML();
    body.querySelector('#bot-watch').innerHTML = watchHTML();
    body.querySelector('#bot-cbar').innerHTML = chartBarHTML();
    body.querySelector('#bot-accts').innerHTML = (st.d.accounts.map(accountHTML).join('') + (st.d.portfolio ? portfolioHTML(st.d.portfolio) : '')) || `<p class="tm-empty">${t('bot.noAcct')}</p>`;
    const sc = body.querySelector('.tm-scroll')?.scrollTop || 0; // garder la position dans le tableau
    body.querySelector('#bot-blot').innerHTML = blotterHTML();
    const scroller = body.querySelector('.tm-scroll'); if (scroller) scroller.scrollTop = sc;
    drawCurves(body);
    drawChart();
  }

  function tick() {
    if (!st.el?.isConnected || document.hidden) return;
    load(fill);
  }

  function render(el) {
    st.el = el;
    el.innerHTML = `<div class="tm" id="bot-body"></div>`;
    st.chart = null;
    fill();
    el.onclick = (e) => {
      const b = e.target.closest('[data-bmk],[data-btf],[data-bsrc],[data-mk],[data-tab2],[data-more]');
      if (!b) return;
      if (b.dataset.tab2) {
        st.tab = b.dataset.tab2; st.shown = PAGE;
        el.querySelector('#bot-blot').innerHTML = blotterHTML();
        drawChart();
        return;
      }
      if (b.hasAttribute('data-more')) { st.shown += PAGE; el.querySelector('#bot-blot').innerHTML = blotterHTML(); return; }
      if (b.dataset.bmk) st.market = b.dataset.bmk;
      else if (b.dataset.btf) st.tf = b.dataset.btf;
      else if (b.dataset.bsrc) { st.src = b.dataset.bsrc; try { localStorage.setItem(SRC_KEY, st.src); } catch { /* stockage indisponible */ } }
      else if (b.dataset.mk) {
        st.market = b.dataset.mk;
        if (b.dataset.te) {
          // Trade de l'historique : unité de temps qui couvre sa date (Yahoo : 5 j en 5 min, 1 mois en 15 min, 3 mois en 1 h)
          const te = Number(b.dataset.te), tx = Number(b.dataset.tx);
          const age = (Date.now() / 1000 - te) / 86400;
          st.tf = age < 4 && tx - te < 86400 ? '5m' : age < 28 ? '15m' : age < 85 ? '1h' : '1d';
          st.focus = { entryT: te, exitT: tx };
          st.src = 'bot';
        }
        el.querySelector('#bot-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      st.chart?.chart?.remove(); st.chart = null;
      fill();
    };
    load(fill);
    clearInterval(st.timer);
    let n = 0;
    st.timer = setInterval(() => {
      if (!st.el?.isConnected) { clearInterval(st.timer); st.timer = null; return; }
      n++;
      tick();
      if ((n * LIVE_MS) % CANDLE_MS === 0) drawChart();
    }, LIVE_MS);
  }

  return { render, load };
}
