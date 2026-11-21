// Catégorie « Bot » : bot de paper trading en direct (simulation, argent fictif).
// État publié par le bot toutes les 15 s environ (/api/bot) : comptes FTMO et Lucid simulés, positions ouvertes avec
// entrée / SL / TP, derniers trades. Graphique : TradingView Lightweight Charts™ (servie par le site), bougies Yahoo
// (/api/candles), lignes d'entrée, de stop et d'objectif de chaque position, repères des trades clôturés.

const LIB = '/vendor/lightweight-charts/lightweight-charts.standalone.production.js';
const TFS = ['5m', '15m', '1h', '1d'];
const TF_SEC = { '5m': 300, '15m': 900, '1h': 3600, '1d': 86400 };
const TV = { gold: 'COMEX:GC1!', nas100: 'NASDAQ:NDX', spx: 'SP:SPX', eurusd: 'FX:EURUSD' };
const EMOJI = { gold: '🥇', nas100: '🇺🇸', spx: '🗽', eurusd: '💶' };
const LIVE_MS = 15_000;
const CANDLE_MS = 30_000;
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
const cssVar = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;

export function createBot(ctx) {
  const { t, esc, isNum, ND } = ctx;
  const st = { d: null, at: 0, err: false, loading: false, market: null, tf: '15m', timer: null, chart: null, el: null };
  const cls = (v) => (!isNum(v) || Math.abs(v) < 0.5 ? '' : v > 0 ? 'pos' : 'neg');
  const money = (v) => (isNum(v) ? ctx.money(v) : ND);
  const signed = (v) => (isNum(v) ? ctx.signed(v) : ND);
  const px = (v) => (isNum(v) ? (Math.abs(v) < 10 ? v.toFixed(5) : v.toLocaleString(ctx.locale(), { maximumFractionDigits: 2 })) : ND);
  const mkName = (id) => st.d?.markets?.find((m) => m.id === id)?.name || id;

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

  /* ---------- Comptes ---------- */
  function gauge(frac, tone, label, sub) {
    const w = Math.max(0, Math.min(1, isNum(frac) ? frac : 0)) * 100;
    return `<div class="bot-g"><div class="bot-g-h"><span>${label}</span><b>${sub}</b></div><div class="bot-g-bar"><i class="${tone}" style="width:${w.toFixed(1)}%"></i></div></div>`;
  }
  function accountHTML(a) {
    const ret = ((a.equity / a.capital) - 1) * 100;
    const danger = (u) => (u > 0.6 ? 'neg' : u > 0.3 ? 'warn' : 'pos');
    const phase = a.phase === 'funded' ? t('bot.funded') : `${a.program} · ${t('bot.attempt', { n: a.attempt })}`;
    return `<article class="bot-acct">
      <header><span class="bot-firm bot-firm-${esc(a.id)}">${esc(a.firm)}</span><div><b>${esc(a.label)}</b><small>${esc(phase)}</small></div></header>
      <div class="bot-eq"><b>${money(a.equity)}</b><span class="${cls(ret * 100)}">${ctx.pct(ret)}</span></div>
      <p class="bot-sub">${t('bot.split', { u: signed(a.unrealized), r: signed(a.realized), n: a.open.length })}</p>
      ${isNum(a.target) ? gauge(a.progress, 'pos', t('bot.goal', { p: a.targetPct, v: money(a.target) }), `${Math.round(Math.min(1, Math.max(0, a.progress || 0)) * 100)} %`) : `<p class="bot-sub">${t('bot.fundedGain', { s: a.split })}</p>`}
      ${isNum(a.dailyLimitPct) ? gauge(a.dailyUsed, danger(a.dailyUsed), t('bot.daily', { p: a.dailyLimitPct }), t('bot.floor', { v: money(a.dailyFloor) })) : `<div class="bot-g"><div class="bot-g-h"><span>${t('bot.dailyNone')}</span><b>—</b></div></div>`}
      ${gauge(a.maxUsed, danger(a.maxUsed), t(a.trailing ? 'bot.maxTrail' : 'bot.max', { v: money(a.maxLoss) }), t('bot.floor', { v: money(a.maxFloor) }))}
      <p class="bot-sub">${t('bot.days', { n: a.days, m: a.minDays })}${a.bestDayPct ? ` · ${t('bot.bestDay', { p: a.bestDayPct })}` : ''}</p>
      <div class="bot-curve" data-curve="${esc(a.id)}"></div>
    </article>`;
  }

  /** Courbe de la valeur du compte (trades clôturés, puis valeur actuelle). */
  async function drawCurves(root) {
    const LWC = await loadLib().catch(() => null);
    if (!LWC || !st.d) return;
    for (const a of st.d.accounts) {
      const box = root.querySelector(`[data-curve="${a.id}"]`);
      if (!box) continue;
      box.innerHTML = '';
      const pts = [];
      let v = a.balance - a.closed.reduce((s, x) => s + (x.pnl || 0), 0);
      const t0 = a.closed[0]?.entryT || Math.floor(Date.now() / 1000) - 86400;
      pts.push({ time: local(t0), value: v });
      for (const x of [...a.closed].sort((p, q) => p.exitT - q.exitT)) { v += x.pnl || 0; pts.push({ time: local(x.exitT), value: v }); }
      pts.push({ time: local(Math.floor((st.d.at || Date.now()) / 1000)), value: a.equity });
      const uniq = []; for (const p of pts) { if (uniq.length && p.time <= uniq[uniq.length - 1].time) p.time = uniq[uniq.length - 1].time + 1; uniq.push(p); }
      const ch = LWC.createChart(box, { height: 90, autoSize: true, layout: { background: { type: 'solid', color: 'transparent' }, textColor: cssVar('--muted', '#8d9aab'), attributionLogo: false },
        grid: { vertLines: { visible: false }, horzLines: { visible: false } }, rightPriceScale: { visible: false }, timeScale: { visible: false }, handleScroll: false, handleScale: false, crosshair: { mode: 2 } });
      const up = a.equity >= a.capital;
      const s = ch.addSeries(LWC.AreaSeries, { lineColor: up ? cssVar('--up', '#22c55e') : cssVar('--down', '#f05252'), topColor: up ? 'rgba(34,197,94,.25)' : 'rgba(240,82,82,.25)', bottomColor: 'rgba(0,0,0,0)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false });
      s.setData(uniq);
      s.createPriceLine({ price: a.capital, color: cssVar('--muted', '#8d9aab'), lineStyle: 2, lineWidth: 1, axisLabelVisible: false, title: '' });
      ch.timeScale().fitContent();
    }
  }

  /* ---------- Graphique TradingView ---------- */
  function positionsOn(market) {
    return (st.d?.accounts || []).flatMap((a) => a.open.filter((p) => p.market === market).map((p) => ({ ...p, acct: a.firm })));
  }
  async function drawChart() {
    const box = st.el?.querySelector('#bot-chart');
    if (!box || !st.d) return;
    const LWC = await loadLib().catch(() => null);
    if (!LWC) { box.innerHTML = `<p class="mc-note">${t('bot.chartNa')}</p>`; return; }
    const m = st.d.markets.find((x) => x.id === st.market) || st.d.markets[0];
    if (!m) return;
    let data = null;
    try { data = (await ctx.getJSON(`/api/candles?kind=i&symbol=${encodeURIComponent(m.symbol)}&tf=${st.tf}`)).body; } catch { /* n/d */ }
    if (!box.isConnected) return;
    if (!data?.candles?.length) { box.innerHTML = `<p class="mc-note">${t('bot.chartNa')}</p>`; st.chart?.chart?.remove(); st.chart = null; return; }
    const key = `${m.id}:${st.tf}`;
    if (!st.chart || st.chart.key !== key || !box.contains(st.chart.host)) {
      st.chart?.chart?.remove();
      box.innerHTML = '';
      const host = document.createElement('div');
      host.className = 'bot-chart-host';
      box.append(host);
      const grid = document.documentElement.dataset.theme === 'light' ? '#e6ebf1' : '#1b2430';
      const chart = LWC.createChart(host, { autoSize: true, height: 380,
        layout: { background: { type: 'solid', color: cssVar('--surface', '#121921') }, textColor: cssVar('--muted', '#8d9aab') },
        grid: { vertLines: { color: grid }, horzLines: { color: grid } }, rightPriceScale: { borderColor: cssVar('--border', '#232d39') },
        timeScale: { borderColor: cssVar('--border', '#232d39'), timeVisible: st.tf !== '1d', secondsVisible: false } });
      const series = chart.addSeries(LWC.CandlestickSeries, { upColor: '#22c55e', downColor: '#f05252', borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#f05252',
        priceFormat: { type: 'price', precision: m.id === 'eurusd' ? 5 : 2, minMove: m.id === 'eurusd' ? 0.00001 : 0.01 } });
      st.chart = { key, host, chart, series, LWC, lines: [], markers: null, first: true };
    }
    const c = st.chart;
    c.series.setData(data.candles.map(([time, o, h, l, cl]) => ({ time: local(time), open: o, high: h, low: l, close: cl })));
    // Lignes des positions ouvertes : entrée (bleu), SL (rouge), TP (vert)
    for (const l of c.lines) c.series.removePriceLine(l);
    c.lines = [];
    const add = (price, color, title, style = 0) => { if (isNum(price)) c.lines.push(c.series.createPriceLine({ price, color, lineWidth: 2, lineStyle: style, axisLabelVisible: true, title })); };
    for (const p of positionsOn(m.id)) {
      const tag = `${p.acct} ${p.sid}`;
      add(p.entry, '#7cc4ff', `${tag} · ${t(p.side === 'long' ? 'bot.buy' : 'bot.sell')}`);
      add(p.sl, '#f05252', `${tag} · SL`, 2);
      add(p.tp, '#22c55e', `${tag} · TP`, 2);
    }
    // Repères : entrées et sorties des trades récents (compte FTMO, sinon Lucid), dans la période affichée
    const first = data.candles[0][0];
    const sec = TF_SEC[st.tf];
    const snap = (x) => local(Math.floor(x / sec) * sec);
    const acct = st.d.accounts.find((a) => a.id === 'ftmo') || st.d.accounts[0];
    const marks = [];
    for (const x of (acct?.closed || []).filter((y) => y.market === m.id && y.exitT >= first)) {
      if (x.entryT >= first) marks.push({ time: snap(x.entryT), position: x.side === 'long' ? 'belowBar' : 'aboveBar', color: '#7cc4ff', shape: x.side === 'long' ? 'arrowUp' : 'arrowDown', text: x.sid });
      marks.push({ time: snap(x.exitT), position: 'aboveBar', color: x.pnl >= 0 ? '#22c55e' : '#f05252', shape: 'circle', text: signed(x.pnl) });
    }
    for (const p of positionsOn(m.id)) if (p.entryT >= first) marks.push({ time: snap(p.entryT), position: p.side === 'long' ? 'belowBar' : 'aboveBar', color: '#7cc4ff', shape: p.side === 'long' ? 'arrowUp' : 'arrowDown', text: `${p.acct} ${p.sid}` });
    marks.sort((a, b) => a.time - b.time);
    if (c.markers) c.markers.setMarkers(marks); else c.markers = c.LWC.createSeriesMarkers(c.series, marks);
    // Ouverture sur les ~150 dernières bougies (zoom libre ensuite, conservé aux mises à jour)
    if (c.first) { const n = data.candles.length; c.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 150), to: n + 4 }); c.first = false; }
  }

  /* ---------- Tableaux ---------- */
  function positionsHTML() {
    const rows = (st.d?.accounts || []).flatMap((a) => a.open.map((p) => ({ a, p })));
    if (!rows.length) return `<p class="mc-note">${t('bot.noPos')}</p>`;
    return `<div class="bot-table-wrap"><table class="bot-table"><thead><tr><th>${t('bot.acct')}</th><th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th>${t('bot.entry')}</th><th>SL</th><th>TP</th><th>${t('bot.size')}</th><th>${t('bot.pnl')}</th></tr></thead><tbody>
      ${rows.map(({ a, p }) => `<tr data-mk="${esc(p.market)}" class="bot-click"><td><span class="bot-firm bot-firm-${esc(a.id)}">${esc(a.firm)}</span></td><td>${EMOJI[p.market] || ''} ${esc(mkName(p.market))}</td>
        <td title="${esc(p.name || '')}"><code>${esc(p.sid)}</code>${isNum(p.ai) ? ` <small>IA ${p.ai} %</small>` : ''}</td><td class="${p.side === 'long' ? 'pos' : 'neg'}">${t(p.side === 'long' ? 'bot.buy' : 'bot.sell')}</td>
        <td>${px(p.entry)}</td><td class="neg">${px(p.sl)}</td><td class="pos">${isNum(p.tp) ? px(p.tp) : '—'}</td><td>${p.n ? `${p.n} ${esc(p.contract || '')}` : money(p.notional)}<small> · ${t('bot.risk')} ${money(p.risk)}</small></td>
        <td class="${cls(p.pnl)}"><b>${signed(p.pnl)}</b></td></tr>`).join('')}</tbody></table></div>`;
  }
  function tradesHTML() {
    const rows = (st.d?.accounts || []).flatMap((a) => a.closed.map((x) => ({ a, x }))).sort((p, q) => q.x.exitT - p.x.exitT).slice(0, 40);
    if (!rows.length) return `<p class="mc-note">${t('bot.noTrades')}</p>`;
    return `<div class="bot-table-wrap"><table class="bot-table"><thead><tr><th>${t('bot.date')}</th><th>${t('bot.acct')}</th><th>${t('bot.market')}</th><th>${t('bot.strat')}</th><th>${t('bot.side')}</th><th>${t('bot.inOut')}</th><th>${t('bot.result')}</th><th>${t('bot.why')}</th></tr></thead><tbody>
      ${rows.map(({ a, x }) => `<tr data-mk="${esc(x.market)}" class="bot-click"><td>${esc(ctx.day(x.exitT * 1000))} ${esc(ctx.time(x.exitT * 1000))}</td><td><span class="bot-firm bot-firm-${esc(a.id)}">${esc(a.firm)}</span></td>
        <td>${EMOJI[x.market] || ''} ${esc(mkName(x.market))}</td><td title="${esc(x.name || '')}"><code>${esc(x.sid)}</code></td><td class="${x.side === 'long' ? 'pos' : 'neg'}">${t(x.side === 'long' ? 'bot.buy' : 'bot.sell')}</td>
        <td>${px(x.entry)} → ${px(x.exit)}</td><td class="${cls(x.pnl)}"><b>${signed(x.pnl)}</b>${isNum(x.risk) && x.risk > 0 ? `<small> · ${(x.pnl / x.risk).toFixed(1)} R</small>` : ''}</td><td><small>${esc(x.reason || '')}</small></td></tr>`).join('')}</tbody></table></div>`;
  }
  function refusedHTML() {
    const r = st.d?.accounts?.find((a) => a.refused)?.refused;
    if (!r) return '';
    return `<p class="bot-sub">🤖 ${t('bot.refused', { n: r.n, c: r.closed, v: signed(r.closedPnl), w: r.wins })}${r.closed ? ` ${r.closedPnl <= 0 ? t('bot.aiRight') : t('bot.aiWrong')}` : ''}</p>`;
  }

  /* ---------- Rendu ---------- */
  function headHTML() {
    const at = st.d?.at;
    const age = at ? (Date.now() - at) / 1000 : Infinity;
    const live = age < 180;
    return `<div class="bot-live ${live ? 'on' : 'off'}"><i></i>${live ? t('bot.live', { t: ctx.time(at) }) : at ? t('bot.offline', { d: ctx.day(at), t: ctx.time(at) }) : t('bot.never')}</div>
      ${st.d?.adapt ? `<p class="bot-sub">${esc(st.d.adapt)}</p>` : ''}`;
  }
  function marketBar() {
    const ms = st.d?.markets || [];
    return `<div class="seg" role="group" aria-label="${t('bot.market')}">${ms.map((m) => { const n = positionsOn(m.id).length; return `<button type="button" data-bmk="${esc(m.id)}" aria-pressed="${m.id === st.market}">${EMOJI[m.id] || ''} ${esc(m.name)}${n ? ` <span class="bot-badge">${n}</span>` : ''}</button>`; }).join('')}</div>
      <div class="seg" role="group" aria-label="${t('bot.tf')}">${TFS.map((x) => `<button type="button" data-btf="${x}" aria-pressed="${x === st.tf}">${x}</button>`).join('')}</div>`;
  }

  function fill() {
    const el = st.el;
    if (!el?.isConnected) return;
    if (!st.d) {
      el.querySelector('#bot-body').innerHTML = `<p class="mc-note">${st.err ? t('bot.na') : st.at ? t('bot.never') : t('loading')}</p>`;
      return;
    }
    if (!st.market) st.market = (st.d.accounts.flatMap((a) => a.open)[0]?.market) || st.d.markets[0]?.id;
    const body = el.querySelector('#bot-body');
    if (!body.querySelector('#bot-chart')) {
      body.innerHTML = `<div id="bot-head"></div>
        <div class="bot-accts" id="bot-accts"></div>
        <section class="bot-sec"><div class="bot-tools" id="bot-tools"></div><div id="bot-chart" class="bot-chart"></div>
          <p class="bot-sub" id="bot-legend"></p></section>
        <section class="bot-sec"><h3>${t('bot.openPos')}</h3><div id="bot-pos"></div></section>
        <section class="bot-sec"><h3>${t('bot.trades')}</h3><div id="bot-refused"></div><div id="bot-trades"></div></section>`;
    }
    body.querySelector('#bot-head').innerHTML = headHTML();
    body.querySelector('#bot-accts').innerHTML = st.d.accounts.map(accountHTML).join('') || `<p class="mc-note">${t('bot.noAcct')}</p>`;
    body.querySelector('#bot-tools').innerHTML = marketBar();
    const m = st.d.markets.find((x) => x.id === st.market);
    body.querySelector('#bot-legend').innerHTML = `${t('bot.legend')} · <a href="https://www.tradingview.com/chart/?symbol=${encodeURIComponent(TV[st.market] || '')}" target="_blank" rel="noopener">${t('bot.openTV', { m: esc(m?.name || '') })}</a>`;
    body.querySelector('#bot-pos').innerHTML = positionsHTML();
    body.querySelector('#bot-refused').innerHTML = refusedHTML();
    body.querySelector('#bot-trades').innerHTML = tradesHTML();
    drawCurves(body);
    drawChart();
  }

  function tick() {
    if (!st.el?.isConnected || document.hidden) return;
    load(fill);
  }

  function render(el) {
    st.el = el;
    el.innerHTML = `<section class="card bot-card">
      <h2>${t('bot.title')}</h2>
      <p class="ai-badge" role="note">${t('bot.disclosure')}</p>
      <div id="bot-body"></div>
    </section>`;
    st.chart = null;
    fill();
    el.onclick = (e) => {
      const b = e.target.closest('[data-bmk],[data-btf],[data-mk]');
      if (!b) return;
      if (b.dataset.bmk) st.market = b.dataset.bmk;
      else if (b.dataset.btf) st.tf = b.dataset.btf;
      else if (b.dataset.mk) { st.market = b.dataset.mk; el.querySelector('#bot-chart')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
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
